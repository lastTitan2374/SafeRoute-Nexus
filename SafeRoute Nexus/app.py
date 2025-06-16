from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv
import os
import googlemaps
from flask_pymongo import PyMongo
import google.generativeai as genai
import requests
import polyline

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure MongoDB
app.config["MONGO_URI"] = os.getenv("MONGODB_URI", "mongodb://localhost:27017/maps_clone")
mongo = PyMongo(app)

# Initialize API clients
gmaps = googlemaps.Client(key=os.getenv('GOOGLE_MAPS_API_KEY'))
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
model = genai.GenerativeModel('gemini-pro')

# Initialize Weather, Event, and TomTom APIs
WEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')
TICKETMASTER_API_KEY = os.getenv('TICKETMASTER_API_KEY')
TOMTOM_API_KEY = os.getenv('TOMTOM_API_KEY')  # Add your TomTom API key to .env

@app.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html', 
                         google_maps_api_key=os.getenv('GOOGLE_MAPS_API_KEY'))

@app.route('/api/directions', methods=['POST'])
def get_directions():
    """Get directions and traffic data for a route."""
    data = request.json
    origin = data.get('origin')
    destination = data.get('destination')
    
    try:
        # Get directions with alternatives
        directions_result = gmaps.directions(
            origin,
            destination,
            alternatives=True,
            mode="driving",
            departure_time="now",
            traffic_model="best_guess"
        )
        
        # Process and enhance the routes with traffic data
        enhanced_routes = []
        for route in directions_result:
            legs = route['legs'][0]
            route_info = {
                'distance': legs['distance']['text'],
                'duration': legs['duration']['text'],
                'duration_in_traffic': legs.get('duration_in_traffic', {}).get('text', 'N/A'),
                'steps': legs['steps'],
                'polyline': route['overview_polyline']['points'],
                'congestion_level': calculate_congestion_level(legs)
            }
            enhanced_routes.append(route_info)
        
        return jsonify({'routes': enhanced_routes})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def calculate_congestion_level(leg):
    """Calculate congestion level based on normal duration vs duration in traffic."""
    normal_duration = leg['duration']['value']
    traffic_duration = leg.get('duration_in_traffic', {}).get('value', normal_duration)
    
    ratio = traffic_duration / normal_duration
    
    if ratio <= 1.2:
        return 'low'
    elif ratio <= 1.5:
        return 'medium'
    else:
        return 'high'

@app.route('/api/places/search', methods=['GET'])
def search_places():
    """Search for places using Google Places API."""
    query = request.args.get('query')
    try:
        places_result = gmaps.places(query)
        return jsonify(places_result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat_with_gemini():
    """Process chat queries using Gemini API."""
    data = request.json
    query = data.get('query')
    context = data.get('context', {})
    
    try:
        # First, ask Gemini to extract locations from the query
        location_prompt = f"""Extract the starting location and destination from this navigation query: "{query}"
        If the query contains locations, respond with a JSON object exactly like this:
        {{
            "start": "exact starting location",
            "end": "exact destination location",
            "has_locations": true
        }}
        If no locations are found, respond with:
        {{
            "has_locations": false
        }}
        Important: Keep location names exactly as mentioned in the query. Only include the JSON, no other text."""
        
        location_response = model.generate_content(location_prompt)
        
        try:
            # Try to safely parse the response
            import json
            import ast
            
            # Clean the response text
            response_text = location_response.text.strip()
            
            # Try parsing as JSON first
            try:
                locations = json.loads(response_text)
            except json.JSONDecodeError:
                # If JSON parsing fails, try using ast.literal_eval
                try:
                    # Remove any markdown formatting if present
                    if response_text.startswith('```') and response_text.endswith('```'):
                        response_text = response_text[3:-3].strip()
                    if response_text.startswith('{') and response_text.endswith('}'):
                        locations = ast.literal_eval(response_text)
                    else:
                        raise ValueError("Invalid response format")
                except:
                    # If both parsing methods fail, assume no locations
                    locations = {"has_locations": False}
        except Exception as parse_error:
            print(f"Error parsing location response: {parse_error}")
            print(f"Raw response: {response_text}")
            locations = {"has_locations": False}
        
        if locations.get('has_locations'):
            # Get directions for the extracted locations
            try:
                directions_result = gmaps.directions(
                    locations['start'],
                    locations['end'],
                    alternatives=True,
                    mode="driving",
                    departure_time="now",
                    traffic_model="best_guess"
                )
                
                if directions_result:
                    # Get route details
                    route_info = directions_result[0]['legs'][0]
                    
                    # Format a detailed response
                    response_prompt = f"""Create a detailed navigation response for a route from {locations['start']} to {locations['end']}.
                    
                    Include these exact details in a friendly, conversational way:
                    - Total Distance: {route_info['distance']['text']}
                    - Estimated Time: {route_info['duration']['text']}
                    - Current Traffic: {route_info.get('duration_in_traffic', {}).get('text', 'not available')}
                    
                    Also include:
                    1. A brief overview of the main roads/highways used
                    2. Any notable traffic conditions
                    3. Suggestion for the best time to start the journey
                    
                    Format it in a clear, easy-to-read way with appropriate line breaks."""
                    
                    response = model.generate_content(response_prompt)
                    
                    # Include route data for the frontend
                    return jsonify({
                        'response': response.text,
                        'locations': locations,
                        'has_route': True,
                        'route_info': {
                            'distance': route_info['distance']['text'],
                            'duration': route_info['duration']['text'],
                            'duration_in_traffic': route_info.get('duration_in_traffic', {}).get('text', 'not available'),
                            'steps': [step['html_instructions'] for step in route_info['steps']]
                        },
                        'success': True
                    })
                else:
                    return jsonify({
                        'response': f"I couldn't find a route between {locations['start']} and {locations['end']}. Could you please verify these locations and try again?",
                        'success': True,
                        'has_route': False
                    })
            except Exception as route_error:
                print(f"Error getting directions: {route_error}")
                return jsonify({
                    'response': f"I found the locations but couldn't calculate a route. Could you please be more specific with the addresses?",
                    'success': True,
                    'has_route': False
                })
        else:
            # Handle non-navigation queries
            prompt = f"""As a navigation assistant, help with the following query: {query}
            
            Context:
            - Current location: {context.get('origin', 'Not specified')}
            - Destination: {context.get('destination', 'Not specified')}
            - Available routes: {context.get('routes', [])}
            
            Provide a helpful, detailed response."""
            
            response = model.generate_content(prompt)
            return jsonify({
                'response': response.text,
                'success': True,
                'has_route': False
            })
    
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        return jsonify({
            'error': "I'm having trouble understanding that request. Could you please rephrase it?",
            'success': False,
            'has_route': False
        }), 500

@app.route('/api/weather', methods=['GET'])
def get_weather():
    """Get weather data for a specific location."""
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    
    try:
        weather_url = f"http://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={WEATHER_API_KEY}&units=metric"
        response = requests.get(weather_url)
        weather_data = response.json()
        
        return jsonify(weather_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/events', methods=['GET'])
def get_events():
    """Get nearby events that might affect traffic."""
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    radius = request.args.get('radius', '10')  # Default 10km radius
    
    try:
        events_url = f"https://app.ticketmaster.com/discovery/v2/events.json?apikey={TICKETMASTER_API_KEY}&latlong={lat},{lon}&radius={radius}&unit=km"
        response = requests.get(events_url)
        events_data = response.json()
        
        return jsonify(events_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/incidents', methods=['GET'])
def get_incidents():
    """Get traffic incidents for a specific bounding box."""
    bbox = request.args.get('bbox')  # Format: minLon,minLat,maxLon,maxLat
    
    try:
        # Define the fields parameter as a string
        fields = "{incidents{type,geometry{type,coordinates},properties{iconCategory}}}"
        
        # Construct the URL
        url = (
            f"https://api.tomtom.com/maps/orbis/traffic/incidentDetails?"
            f"apiVersion=1&key={TOMTOM_API_KEY}&bbox={bbox}&"
            f"fields={fields}&language=en-GB&t=1111&timeValidityFilter=present"
        )
        
        # Fetch incident data from TomTom API
        response = requests.get(url)
        incidents_data = response.json()
        
        return jsonify(incidents_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/route/analysis', methods=['POST'])
def analyze_route():
    """Analyze a route for traffic, weather, events, and incidents."""
    data = request.json
    route = data.get('route')
    
    try:
        # Get points along the route
        points = polyline.decode(route['polyline'])
        
        # Analyze conditions along the route
        conditions = []
        # Sample points to reduce API calls
        sample_size = min(5, len(points))  # Take at most 5 points
        sampled_points = [points[i] for i in range(0, len(points), len(points)//sample_size)][:sample_size]
        
        for lat, lon in sampled_points:
            try:
                # Get weather
                weather_response = requests.get(
                    f"http://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={WEATHER_API_KEY}&units=metric",
                    timeout=5
                )
                weather = weather_response.json() if weather_response.status_code == 200 else {}
                
                # Get nearby events
                events_response = requests.get(
                    f"https://app.ticketmaster.com/discovery/v2/events.json?apikey={TICKETMASTER_API_KEY}&latlong={lat},{lon}&radius=5&unit=km",
                    timeout=5
                )
                events = events_response.json() if events_response.status_code == 200 else {}
                
                # Get incidents for the bounding box around the point
                bbox = f"{lon-0.1},{lat-0.1},{lon+0.1},{lat+0.1}"  # 0.1 degree buffer
                incidents_response = requests.get(
                    f"http://127.0.0.1:5000/api/incidents?bbox={bbox}",  # Use the local endpoint
                    timeout=5
                )
                incidents = incidents_response.json() if incidents_response.status_code == 200 else {}
                
                conditions.append({
                    'location': {'lat': lat, 'lng': lon},
                    'weather': weather.get('weather', [{}])[0].get('main', 'Unknown'),
                    'temperature': weather.get('main', {}).get('temp', 0),
                    'events': len(events.get('_embedded', {}).get('events', [])),
                    'incidents': incidents.get('incidents', []),
                    'congestion': route.get('congestion_level', 'medium')
                })
            except requests.exceptions.RequestException as e:
                print(f"Error fetching data for point ({lat}, {lon}): {str(e)}")
                continue
        
        return jsonify({'conditions': conditions})
    except Exception as e:
        print(f"Route analysis error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)