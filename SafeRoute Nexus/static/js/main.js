let map;
let directionsService;
let directionsRenderer;
let heatmap;
let weatherHeatmap;
let eventHeatmap;
let markers = [];
let currentInfoWindow = null;

// Initialize the map and related services
function initMap() {
    // Create map instance
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 9.9921626, lng: 76.358908 },
        zoom: 12,
        mapTypeControl: false,
    });

    // Initialize services
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: null, // Do not set the map initially
        suppressMarkers: true,
        panel: document.getElementById('directions-panel')
    });

    // Initialize heatmap layers
    heatmap = new google.maps.visualization.HeatmapLayer({
        map: map,
        radius: 20,
        opacity: 0.6,
        gradient: ['rgba(0, 255, 255, 0)', 'rgba(0, 255, 255, 1)', 'rgba(0, 191, 255, 1)',
                  'rgba(0, 127, 255, 1)', 'rgba(0, 63, 255, 1)', 'rgba(0, 0, 255, 1)',
                  'rgba(0, 0, 223, 1)', 'rgba(0, 0, 191, 1)', 'rgba(0, 0, 159, 1)',
                  'rgba(0, 0, 127, 1)', 'rgba(63, 0, 91, 1)', 'rgba(127, 0, 63, 1)',
                  'rgba(191, 0, 31, 1)', 'rgba(255, 0, 0, 1)']
    });

    weatherHeatmap = new google.maps.visualization.HeatmapLayer({
        map: null,
        radius: 30,
        opacity: 0.4
    });

    eventHeatmap = new google.maps.visualization.HeatmapLayer({
        map: null,
        radius: 25,
        opacity: 0.5
    });

    // Initialize incident heatmap layer
    incidentHeatmap = new google.maps.visualization.HeatmapLayer({
        map: null,
        radius: 20,
        opacity: 0.7,
        gradient: ['rgba(255, 0, 0, 0)', 'rgb(0, 255, 13)'] // Red gradient for incidents
    });

    // Initialize places service for autocomplete
    const originInput = document.getElementById('origin-input');
    const destinationInput = document.getElementById('destination-input');

    if (originInput && destinationInput) {
        setupAutocomplete(originInput);
        setupAutocomplete(destinationInput);
    }

    setupEventListeners();
}

function setupEventListeners() {
    // Map control buttons
    const trafficBtn = document.getElementById('toggle-traffic');
    const satelliteBtn = document.getElementById('toggle-satellite');
    const terrainBtn = document.getElementById('toggle-terrain');
    const directionsBtn = document.getElementById('get-directions');
    const locationBtn = document.getElementById('use-location');

    if (trafficBtn) trafficBtn.addEventListener('click', toggleTrafficLayer);
    if (satelliteBtn) satelliteBtn.addEventListener('click', toggleSatelliteView);
    if (terrainBtn) terrainBtn.addEventListener('click', toggleTerrainView);
    if (directionsBtn) directionsBtn.addEventListener('click', calculateAndDisplayRoute);
    if (locationBtn) locationBtn.addEventListener('click', useDeviceLocation);
}

async function useDeviceLocation() {
    const locationButton = document.getElementById('use-location');
    const originInput = document.getElementById('origin-input');

    if (!locationButton || !originInput) return;

    // Add loading state
    locationButton.classList.add('loading');
    locationButton.disabled = true;

    try {
        const position = await getCurrentPosition();
        const { latitude, longitude } = position.coords;

        // Get address from coordinates
        const geocoder = new google.maps.Geocoder();
        const latlng = { lat: latitude, lng: longitude };

        geocoder.geocode({ location: latlng }, (results, status) => {
            if (status === 'OK' && results[0]) {
                // Update input with formatted address
                originInput.value = results[0].formatted_address;
                
                // Center map on location
                map.setCenter(latlng);
                map.setZoom(15);

                // Add marker for current location
                addMarker({
                    geometry: { location: latlng },
                    name: 'Your Location',
                    formatted_address: results[0].formatted_address
                });
            } else {
                // If geocoding fails, just use coordinates
                originInput.value = `${latitude},${longitude}`;
            }
        });
    } catch (error) {
        console.error('Error getting location:', error);
        alert('Unable to get your location. Please make sure location services are enabled.');
    } finally {
        // Remove loading state
        locationButton.classList.remove('loading');
        locationButton.disabled = false;
    }
}

function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        });
    });
}

function setupAutocomplete(input) {
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry) {
            map.setCenter(place.geometry.location);
            map.setZoom(15);
            addMarker(place);
        }
    });
}

function toggleTrafficLayer() {
    if (trafficLayer) {
        trafficLayer.setMap(null);
        trafficLayer = null;
    } else {
        trafficLayer = new google.maps.TrafficLayer();
        trafficLayer.setMap(map);
    }
}

function toggleSatelliteView() {
    const currentMapType = map.getMapTypeId();
    map.setMapTypeId(
        currentMapType === 'satellite' ? 'roadmap' : 'satellite'
    );
}

function toggleTerrainView() {
    const currentMapType = map.getMapTypeId();
    map.setMapTypeId(
        currentMapType === 'terrain' ? 'roadmap' : 'terrain'
    );
}

function addMarker(place) {
    clearMarkers();
    
    const marker = new google.maps.Marker({
        map: map,
        position: place.geometry.location,
        title: place.name
    });

    const infoWindow = new google.maps.InfoWindow({
        content: `
            <div>
                <h3>${place.name}</h3>
                <p>${place.formatted_address || ''}</p>
                ${place.rating ? `<p>Rating: ${place.rating} ⭐</p>` : ''}
            </div>
        `
    });

    marker.addListener('click', () => {
        if (currentInfoWindow) {
            currentInfoWindow.close();
        }
        infoWindow.open(map, marker);
        currentInfoWindow = infoWindow;
    });

    markers.push(marker);
}

function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    if (currentInfoWindow) {
        currentInfoWindow.close();
    }
}

function calculateAndDisplayRoute() {
    const origin = document.getElementById('origin-input').value;
    const destination = document.getElementById('destination-input').value;

    if (!origin || !destination) {
        alert('Please enter both origin and destination');
        return;
    }

    // Log the origin and destination for debugging
    console.log("Origin:", origin);
    console.log("Destination:", destination);

    // Display routes dynamically
    displayRoutes(origin, destination);
}

// async function displayRoutes(routes, origin, destination) {
//     const routesList = document.getElementById('routes-list');
//     routesList.innerHTML = '';

//     for (let i = 0; i < routes.length; i++) {
//         const route = routes[i];
        
//         // Create route card
//         const routeCard = document.createElement('div');
//         routeCard.className = `route-card ${i === 0 ? 'selected' : ''}`;
        
//         // Add route info
//         routeCard.innerHTML = `
//             <h4>Route ${i + 1}</h4>
//             <p><i class="fas fa-road"></i> Distance: ${route.distance}</p>
//             <p><i class="fas fa-clock"></i> Duration: ${route.duration_in_traffic || route.duration}</p>
//             <p class="congestion-${route.congestion_level}">
//                 <i class="fas fa-traffic-light"></i> Traffic: ${route.congestion_level.charAt(0).toUpperCase() + route.congestion_level.slice(1)}
//             </p>
//             <div class="route-conditions">
//                 <div class="loading-message">Loading conditions...</div>
//             </div>
//         `;

//         // Add click handler
//         routeCard.addEventListener('click', () => {
//             // Update selected state
//             document.querySelectorAll('.route-card').forEach(card => card.classList.remove('selected'));
//             routeCard.classList.add('selected');
            
//             // Display the route
//             displayRoute(route, origin, destination);
            
//             // Analyze route conditions
//             analyzeRoute(route).then(analysis => {
//                 if (analysis && analysis.conditions) {
//                     updateRouteConditions(routeCard, analysis.conditions);
//                     updateHeatmaps(analysis.conditions);
//                 }
//             }).catch(error => {
//                 console.error('Error analyzing route:', error);
//             });
//         });

//         routesList.appendChild(routeCard);

//         // Automatically analyze the route
//         analyzeRoute(route).then(analysis => {
//             if (analysis && analysis.conditions) {
//                 updateRouteConditions(routeCard, analysis.conditions);
//                 if (i === 0) {
//                     updateHeatmaps(analysis.conditions);
//                 }
//             }
//         }).catch(error => {
//             console.error('Error analyzing route:', error);
//         });
//     }

//     // Display the first route by default
//     if (routes.length > 0) {
//         displayRoute(routes[0], origin, destination);
//     }
// }
// Function to show the routes panel
function showRoutesPanel() {
    const routesPanel = document.getElementById('routes-panel');
    routesPanel.classList.remove('hidden');
    routesPanel.classList.add('visible');
}

// Function to hide the routes panel
function hideRoutesPanel() {
    const routesPanel = document.getElementById('routes-panel');
    routesPanel.classList.remove('visible');
    routesPanel.classList.add('hidden');
}

// Modify the search button event listener
document.getElementById('get-directions').addEventListener('click', () => {
    calculateAndDisplayRoute();
    showRoutesPanel();
});

function getCongestionLevel(congestion) {
    switch (congestion) {
        case 'low':
            return 0.3; // Low congestion weight
        case 'medium':
            return 0.6; // Medium congestion weight
        case 'high':
            return 1.0; // High congestion weight
        default:
            return 0.5; // Default congestion weight
    }
}

// Function to calculate congestion factor
function calculateCongestionFactor(route) {
    // Check if the polyline is defined and valid
    if (!route.polyline || typeof route.polyline !== 'string') {
        console.error('Invalid or missing polyline:', route.polyline);
        return 0; // Return a default congestion factor
    }

    try {
        // Decode the polyline to get the path
        const path = google.maps.geometry.encoding.decodePath(route.polyline);

        // Check if the path is valid
        if (!path || path.length === 0) {
            console.error('Invalid or empty path:', path);
            return 0; // Return a default congestion factor
        }

        // Get the total distance of the route
        const totalDistance = route.legs[0].distance.value; // Total distance in meters

        let congestionSum = 0;

        // Iterate through the path and calculate congestion
        for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];

            // Calculate segment distance
            const segmentDistance = google.maps.geometry.spherical.computeDistanceBetween(start, end);

            // Assign congestion level (example: assume congestion level is the same for the entire route)
            const congestionLevel = getCongestionLevel(route.congestion_level);

            // Add to congestion sum
            congestionSum += congestionLevel * segmentDistance;
        }

        // Calculate congestion factor
        const congestionFactor = congestionSum / totalDistance;

        // Ensure the congestion factor is between 0 and 1
        return Math.min(Math.max(congestionFactor, 0), 1);
    } catch (error) {
        console.error('Error calculating congestion factor:', error);
        return 0; // Return a default congestion factor
    }
}

/**
 * Calculate the Safety Factor for a route (ranges from 0 to 1, where 1 is safest).
 * @param {Object} route - The route object containing duration, weather, congestion factor, and incident count.
 * @returns {number} - The Safety Factor (0 to 1).
 */
function calculateSafetyFactor(route) {
    // Debugging: Log input values
    console.log('Duration:', route.duration?.value);
    console.log('Weather:', route.weather);
    console.log('Congestion Factor:', route.congestion_factor);
    console.log('Incident Count:', route.incident_count);

    // Define weights for each factor
    const weights = {
        duration: 0.3,      // Weight for duration
        weather: 0.2,       // Weight for weather
        congestion: 0.3,    // Weight for congestion factor
        incidents: 0.2      // Weight for incident count
    };

    // Normalize duration (0 to 1)
    const maxDuration = 7200; // Example: 2 hours in seconds (adjust based on your data)
    const normalizedDuration = Math.min((route.duration?.value || 0) / maxDuration, 1);

    // Normalize weather severity (0 to 1)
    const weatherSeverity = getWeatherSeverity(route.weather || 'Clear'); // Default to 'Clear' if weather is undefined

    // Congestion factor (already normalized between 0 and 1)
    const congestionFactor = route.congestion_factor || 0; // Default to 0 if congestion_factor is undefined

    // Normalize incident count (0 to 1)
    const maxIncidents = 10; // Example: Maximum expected incidents (adjust based on your data)
    const normalizedIncidents = Math.min((route.incident_count || 0) / maxIncidents, 1);

    // Calculate Safety Factor
    const safetyFactor = 1 - (
        weights.duration * normalizedDuration +
        weights.weather * weatherSeverity +
        weights.congestion * congestionFactor +
        weights.incidents * normalizedIncidents
    );

    // Ensure the Safety Factor is within the range [0, 1]
    return Math.min(Math.max(safetyFactor, 0), 1);
}

/**
 * Get the severity of weather conditions (0 to 1).
 * @param {string} weather - The weather condition (e.g., "Rain", "Snow").
 * @returns {number} - Weather severity (0 to 1).
 */
function getWeatherSeverity(weather) {
    const weatherSeverityMap = {
        'Clear': 0.1,
        'Cloudy': 0.2,
        'Rain': 0.6,
        'Snow': 0.8,
        'Fog': 0.7,
        'Thunderstorm': 0.9,
        'Drizzle': 0.4,
        'Mist': 0.5
    };
    return weatherSeverityMap[weather] || 0.3; // Default to 0.3 for unknown weather
}

async function displayRoutes(origin, destination) {
    try {
        // Calculate routes dynamically
        const routes = await calculateRoutes(origin, destination);

        const routesList = document.getElementById('routes-list');
        routesList.innerHTML = '';

        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];

            const safetyFactor = calculateSafetyFactor(route);

            // Create route card
            const routeCard = document.createElement('div');
            routeCard.className = `route-card ${i === 0 ? 'selected' : ''}`;

            // Add route info
            routeCard.innerHTML = `
                <span>Route ${i + 1}
                <p class="safety-factor">
                        <i class="fas fa-shield-alt"></i> Safety Factor: ${safetyFactor.toFixed(2)}
                    </p></span>
                <div class="route-info">
                    <h4>Route ${i + 1}</h4>
                    <p><i class="fas fa-road"></i> Distance: ${route.distance}</p>
                    <p><i class="fas fa-clock"></i> Duration: ${route.duration}</p>
                    <p class="congestion-factor">
                        <i class="fas fa-traffic-light"></i> Congestion Factor: ${route.congestion_factor.toFixed(2)}
                    </p>
                    <div class="route-conditions">
                        <div class="loading-message">Loading conditions...</div>
                    </div>
                </div>
            `;

            // Add data attributes for origin and destination
            routeCard.dataset.origin = route.origin;
            routeCard.dataset.destination = route.destination;

            // Add click handler
            routeCard.addEventListener('click', () => {
                // Update selected state
                document.querySelectorAll('.route-card').forEach(card => card.classList.remove('selected'));
                routeCard.classList.add('selected');

                // Extract origin and destination from the card's data attributes
                const origin = routeCard.dataset.origin;
                const destination = routeCard.dataset.destination;

                // Log the extracted values for debugging
                console.log("Origin from card:", origin);
                console.log("Destination from card:", destination);

                // Display the route
                displayRoute(route, origin, destination);

                // Analyze route conditions
                analyzeRoute(route).then(analysis => {
                    if (analysis && analysis.conditions) {
                        updateRouteConditions(routeCard, analysis.conditions);
                        updateHeatmaps(analysis.conditions);
                    }
                }).catch(error => {
                    console.error('Error analyzing route:', error);
                });
            });

            routesList.appendChild(routeCard);

            // Automatically analyze the route (optional)
            analyzeRoute(route).then(analysis => {
                if (analysis && analysis.conditions) {
                    updateRouteConditions(routeCard, analysis.conditions);
                    if (i === 0) {
                        updateHeatmaps(analysis.conditions);
                    }
                }
            }).catch(error => {
                console.error('Error analyzing route:', error);
            });
        }
    } catch (error) {
        console.error('Error calculating routes:', error);
        alert('Unable to calculate routes. Please try again.');
    }
}


function updateRouteConditions(routeCard, conditions) {
    const conditionsDiv = routeCard.querySelector('.route-conditions');
    if (!conditions || conditions.length === 0) {
        conditionsDiv.innerHTML = '<p>No conditions data available</p>';
        return;
    }

    const weatherCounts = {};
    let totalEvents = 0;

    // Count weather occurrences
    conditions.forEach(condition => {
        if (condition.weather) {
            weatherCounts[condition.weather] = (weatherCounts[condition.weather] || 0) + 1;
        }
        totalEvents += condition.events;
    });

    // Find the dominant weather type
    const dominantWeather = Object.entries(weatherCounts)
        .sort((a, b) => b[1] - a[1])[0];

    // Count incidents by type
    const incidentCounts = {};
    conditions.forEach(condition => {
        if (condition.incidents && condition.incidents.length > 0) {
            condition.incidents.forEach(incident => {
                const type = getIncidentType(incident.properties.iconCategory);
                incidentCounts[type] = (incidentCounts[type] || 0) + 1;
            });
        }
    });

    // Display weather and incidents
    conditionsDiv.innerHTML = `
        <p><i class="fas fa-cloud"></i> Weather: ${dominantWeather ? dominantWeather[0] : 'N/A'}</p>
        ${Object.entries(incidentCounts).map(([type, count]) => `
            <p class="incident-type" data-type="${type}">
                <i class="fas fa-exclamation-triangle"></i> ${type}: ${count}
            </p>
        `).join('')}
    `;
}

function getIncidentType(iconCategory) {
    // Map iconCategory to incident type
    const incidentTypes = {
        0: 'Unknown',
        1: 'Accident',
        2: 'Fog',
        3: 'Dangerous Conditions',
        4: 'Rain',
        5: 'Ice',
        6: 'Traffic Jam',
        7: 'Lane Closed',
        8: 'Road Closed',
        9: 'Road Works',
        10: 'Wind',
        11: 'Flooding',
        14: 'Broken Down Vehicle'
    };
    return incidentTypes[iconCategory] || 'Unknown';
}

async function fetchIncidentData(route) {
    const boundingBox = getBoundingBox(route.polyline);
    const url = `http://127.0.0.1:5000/api/incidents?bbox=${boundingBox}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();
        console.log('Incident Data:', data);
        return data.incidents || [];
    } catch (error) {
        console.error('Error fetching incident data:', error);
        return [];
    }
}

function getBoundingBox(polyline) {
    // Decode the polyline to get coordinates
    const path = google.maps.geometry.encoding.decodePath(polyline);
    const lats = path.map(point => point.lat());
    const lngs = path.map(point => point.lng());

    // Calculate bounding box
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return `${minLng},${minLat},${maxLng},${maxLat}`;
}

function getIncidentType(iconCategory) {
    const incidentTypes = {
        0: 'Unknown',
        1: 'Accident',
        2: 'Fog',
        3: 'Dangerous Conditions',
        4: 'Rain',
        5: 'Ice',
        6: 'Traffic Jam',
        7: 'Lane Closed',
        8: 'Road Closed',
        9: 'Road Works',
        10: 'Wind',
        11: 'Flooding',
        14: 'Broken Down Vehicle'
    };
    return incidentTypes[iconCategory] || 'Unknown';
}

async function calculateRoutes(origin, destination) {
    const request = {
        origin: origin,
        destination: destination,
        travelMode: 'DRIVING',
        provideRouteAlternatives: true, // Request multiple routes
    };

    return new Promise((resolve, reject) => {
        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                // Log the Directions API result for debugging
                console.log("Directions Result:", result);

                // Process each route
                const routes = result.routes.map((route, index) => {
                    // Ensure the polyline property is included
                    const polyline = route.overview_polyline;

                    // Calculate congestion factor for this route
                    const congestionFactor = calculateCongestionFactor({
                        ...route,
                        polyline: polyline, // Add polyline property
                    });

                    // Fetch weather and incident data for the route
                    const weather = getWeatherForRoute(route); // Placeholder for weather data
                    const incidentCount = getIncidentCountForRoute(route); // Placeholder for incident data

                    return {
                        origin: origin,
                        destination: destination,
                        distance: route.legs[0].distance.text,
                        duration: route.legs[0].duration.text,
                        weather: weather, // Add weather data
                        congestion_level: route.congestion_level || 'medium', // Default congestion level
                        congestion_factor: congestionFactor, // Add congestion factor
                        incident_count: incidentCount, // Add incident count
                        polyline: polyline, // Add polyline property
                        waypoints: route.legs[0].via_waypoint || [], // Optional: Waypoints for this route
                    };
                });

                resolve(routes);
            } else {
                reject(new Error('Directions request failed due to ' + status));
            }
        });
    });
}

/**
 * Placeholder function to get weather data for a route.
 * @param {Object} route - The route object.
 * @returns {string} - The weather condition (e.g., "Rain", "Clear").
 */
function getWeatherForRoute(route) {
    // Simulate weather data (replace with actual API call)
    const weatherConditions = ['Clear', 'Rain', 'Snow', 'Fog', 'Thunderstorm'];
    const randomIndex = Math.floor(Math.random() * weatherConditions.length);
    return weatherConditions[randomIndex];
}

/**
 * Placeholder function to get incident count for a route.
 * @param {Object} route - The route object.
 * @returns {number} - The number of incidents.
 */
function getIncidentCountForRoute(route) {
    // Simulate incident count (replace with actual API call)
    return Math.floor(Math.random() * 10); // Random number between 0 and 10
}

async function fetchTrafficData(polyline) {
    const apiKey = 'AIzaSyAXoPJ3ZMo4BOcJKU8UOeee3tUrs84eoFI'; // Replace with your API key
    const path = google.maps.geometry.encoding.decodePath(polyline);
    const points = path.map(point => `${point.lat()},${point.lng()}`).join('|');

    const url = `https://roads.googleapis.com/v1/snapToRoads?path=${points}&interpolate=true&key=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Roads API request failed with status ${response.status}`);
        }
        const data = await response.json();
        return data.snappedPoints || [];
    } catch (error) {
        console.error('Error fetching traffic data:', error);
        return [];
    }
}

function updateHeatmaps(conditions) {
    if (!conditions || conditions.length === 0) return;

    const trafficData = [];
    const weatherData = [];
    const eventData = [];
    const incidentData = [];

    conditions.forEach(condition => {
        const location = new google.maps.LatLng(condition.location.lat, condition.location.lng);
        
        // Traffic heatmap
        if (condition.congestion) {
            trafficData.push({
                location: location,
                weight: getTrafficWeight(condition.congestion)
            });
        }

        // Weather heatmap
        const weatherWeight = getWeatherWeight(condition.weather);
        if (weatherWeight > 0) {
            weatherData.push({
                location: location,
                weight: weatherWeight
            });
        }

        // Event heatmap
        if (condition.events > 0) {
            eventData.push({
                location: location,
                weight: Math.min(condition.events, 5) // Cap the weight at 5
            });
        }
    });

    // Incident heatmap
    if (conditions.incidents) {
        conditions.incidents.forEach(incident => {
            const coordinates = incident.geometry.coordinates;
            const incidentType = getIncidentType(incident.properties.iconCategory);

            // Plot the incident on the map
            if (incident.geometry.type === 'LineString') {
                const path = coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }));
                new google.maps.Polyline({
                    path: path,
                    geodesic: true,
                    strokeColor: '#FF0000',
                    strokeOpacity: 1.0,
                    strokeWeight: 2,
                    map: map
                });
            } else if (incident.geometry.type === 'Point') {
                new google.maps.Marker({
                    position: { lat: coordinates[1], lng: coordinates[0] },
                    map: map,
                    title: incidentType
                });
            }

            // Add incident data for the heatmap
            incidentData.push({
                location: new google.maps.LatLng(coordinates[1], coordinates[0]),
                weight: 1 // Each incident has a weight of 1
            });
        });
    }

    // Update heatmap data
    if (trafficData.length > 0) {
        heatmap.setData(trafficData);
        heatmap.setMap(map);
    }
    
    if (weatherData.length > 0) {
        weatherHeatmap.setData(weatherData);
        weatherHeatmap.setMap(map);
    }
    
    if (eventData.length > 0) {
        eventHeatmap.setData(eventData);
        eventHeatmap.setMap(map);
    }

    if (incidentData.length > 0) {
        incidentHeatmap.setData(incidentData);
        incidentHeatmap.setMap(map);
    }
}

function getTrafficWeight(congestion) {
    const weights = {
        'low': 1,
        'medium': 2,
        'high': 3
    };
    return weights[congestion] || 1;
}



function createHeatmapData(route) {
    // Decode the polyline to get path coordinates
    const path = google.maps.geometry.encoding.decodePath(route.polyline);
    
    // Create heatmap data points based on congestion level
    const heatmapData = path.map(point => {
        let weight;
        switch (route.congestion_level) {
            case 'low':
                weight = 0.3;
                break;
            case 'medium':
                weight = 0.6;
                break;
            case 'high':
                weight = 1.0;
                break;
            default:
                weight = 0.3;
        }
        return {
            location: new google.maps.LatLng(point.lat(), point.lng()),
            weight: weight
        };
    });

    return heatmapData;
}

async function analyzeRoute(route) {
    try {
        const conditionsResponse = await fetch('/api/route/analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ route: route })
        });
        const conditions = await conditionsResponse.json();

        // Fetch incident data and add it to conditions
        const incidents = await fetchIncidentData(route);
        conditions.incidents = incidents;

        console.log('Route Conditions:', conditions); // Debugging
        return conditions;
    } catch (error) {
        console.error('Error analyzing route:', error);
        return null;
    }
}

function getWeatherWeight(weather) {
    const weatherWeights = {
        'Rain': 0.7,
        'Snow': 0.9,
        'Thunderstorm': 1.0,
        'Drizzle': 0.5,
        'Fog': 0.6,
        'Mist': 0.4
    };
    return weatherWeights[weather] || 0;
}



// Global variables for simulation
let simulationInterval;
let simulationMarker;
let simulationProgress = 0;
let currentStepIndex = 0;
let currentSegmentIndex = 0;
let segments = [];

// Function to start the simulation
function startSimulation(route) {
    if (!route || !route.legs || route.legs.length === 0) {
        alert('No route selected for simulation.');
        return;
    }

    const legs = route.legs;
    const steps = legs[0].steps; // Get steps from the first leg

    // Clear any existing simulation
    if (simulationMarker) {
        simulationMarker.setMap(null);
    }

    // Create a marker for the simulation
    simulationMarker = new google.maps.Marker({
        map: map,
        position: steps[0].start_location, // Start at the first step
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#00ffeb',
            fillOpacity: 1,
            strokeColor: '#000',
            strokeWeight: 2,
        },
    });

    // Zoom in on the route
    const bounds = new google.maps.LatLngBounds();
    steps.forEach(step => {
        bounds.extend(step.start_location);
        bounds.extend(step.end_location);
    });
    map.fitBounds(bounds);
    map.setZoom(15); // Adjust zoom level as needed

    // Reset progress
    simulationProgress = 0;
    currentStepIndex = 0;
    currentSegmentIndex = 0;
    segments = [];

    // Precompute segments for smooth animation
    steps.forEach(step => {
        const start = step.start_location;
        const end = step.end_location;
        const numSegments = 100; // Number of segments for smooth animation

        // Extract lat/lng values using the lat() and lng() methods
        const startLat = start.lat();
        const startLng = start.lng();
        const endLat = end.lat();
        const endLng = end.lng();

        // Ensure start and end locations have valid lat/lng values
        if (
            typeof startLat === 'number' && typeof startLng === 'number' &&
            typeof endLat === 'number' && typeof endLng === 'number'
        ) {
            for (let i = 0; i <= numSegments; i++) {
                const lat = startLat + (endLat - startLat) * (i / numSegments);
                const lng = startLng + (endLng - startLng) * (i / numSegments);
                segments.push({ lat, lng });
            }
        } else {
            console.error('Invalid start or end location:', start, end);
        }
    });

    console.log('Segments:', segments); // Debugging: Check if segments are populated correctly

    // Start the simulation
    simulateStep(steps);
}

// Function to simulate each step of the route
function simulateStep(steps) {
    console.log('Simulating step:', currentSegmentIndex); // Debugging: Check if simulateStep is called

    if (currentSegmentIndex >= segments.length) {
        clearInterval(simulationInterval);
        alert('Simulation complete!');
        return;
    }

    // Move the marker to the next segment
    const segment = segments[currentSegmentIndex];
    if (typeof segment.lat === 'number' && typeof segment.lng === 'number') {
        simulationMarker.setPosition(segment);
        map.setCenter(segment); // Update the map center to follow the marker
    } else {
        console.error('Invalid segment:', segment);
    }

    // Increment to the next segment
    currentSegmentIndex++;

    // Calculate the duration for the current step
    const step = steps[currentStepIndex];
    const stepDuration = (step.duration.value * 1000) / 100; // Divide by number of segments

    // Schedule the next frame
    simulationInterval = setTimeout(() => simulateStep(steps), stepDuration);
}

// Function to stop the simulation
function stopSimulation() {
    if (simulationInterval) {
        clearTimeout(simulationInterval);
    }
    if (simulationMarker) {
        simulationMarker.setMap(null);
    }
}

// Function to display the route and prepare for simulation
function displayRoute(route, origin, destination) {
    // Clear previous route and heatmap
    directionsRenderer.setMap(null); // Remove the renderer from the map
    if (heatmap) {
        heatmap.setMap(null);
    }

    // Log the origin and destination for debugging
    console.log("Origin:", origin);
    console.log("Destination:", destination);

    // Validate origin and destination
    if (!origin || !destination) {
        console.error("Origin or destination is undefined");
        return;
    }

    // Create request for directions service
    const request = {
        origin: origin,
        destination: destination,
        travelMode: 'DRIVING',
        provideRouteAlternatives: true, // Request alternative routes
        waypoints: route.waypoints || [], // Use waypoints if available
    };

    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            // Log the Directions API result for debugging
            console.log("Directions Result:", result);

            // Find the specific route based on the polyline or waypoints
            const selectedRoute = result.routes.find(r => 
                r.overview_polyline === route.polyline || 
                JSON.stringify(r.waypoints) === JSON.stringify(route.waypoints)
            );

            if (selectedRoute) {
                // Reinitialize the directionsRenderer with the selected route
                directionsRenderer.setMap(map); // Add the renderer back to the map
                directionsRenderer.setDirections({
                    ...result,
                    routes: [selectedRoute] // Only display the selected route
                });

                // Extract steps from the route
                const steps = selectedRoute.legs[0].steps;

                // Store the steps for simulation
                window.currentRoute = {
                    legs: [
                        {
                            steps: steps.map(step => ({
                                start_location: step.start_location,
                                end_location: step.end_location,
                                duration: step.duration
                            }))
                        }
                    ]
                };

                // Create heatmap data based on congestion level
                const heatmapData = createHeatmapData(route);
                heatmap.setMap(map);
                heatmap.setData(heatmapData);
            } else {
                console.error('Selected route not found in Directions API result');
            }
        } else {
            console.error('Directions request failed due to ' + status);
        }
    });
}

// Function to get the current routes
function getCurrentRoutes() {
    const routesList = document.getElementById('routes-list');
    const routes = [];
    if (routesList) {
        routesList.querySelectorAll('.route-option').forEach((route, index) => {
            const distanceEl = route.querySelector('p:nth-child(2)');
            const durationEl = route.querySelector('p:nth-child(3)');
            const congestionEl = route.querySelector('p:nth-child(4)');
            
            routes.push({
                index: index + 1,
                distance: distanceEl?.textContent || '',
                duration: durationEl?.textContent || '',
                congestion: congestionEl?.textContent || ''
            });
        });
    }
    return routes;
}

// Add event listener for the Simulate Button
document.getElementById('simulate-button').addEventListener('click', () => {
    const selectedRouteCard = document.querySelector('.route-card.selected');
    if (!selectedRouteCard) {
        alert('Please select a route to simulate.');
        return;
    }

    // Get the selected route data
    const selectedRoute = window.currentRoute;

    if (selectedRoute) {
        startSimulation(selectedRoute);
    }
});

// Add event listener for the Stop Button
document.getElementById('stop-button').addEventListener('click', () => {
    stopSimulation();
});

// Initialize the map and chat widget when the page loads
window.addEventListener('load', () => {
    initMap();
    
});
