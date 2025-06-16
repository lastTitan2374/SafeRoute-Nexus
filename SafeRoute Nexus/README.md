# Google Maps Clone

A web application that replicates core Google Maps functionality with real-time traffic data and route optimization.

## Features
- Interactive map with zoom, pan, and layer options
- Location search functionality
- Real-time traffic visualization
- Route planning with alternative routes
- Traffic congestion heatmap
- Turn-by-turn navigation

## Setup Instructions

1. Clone the repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the project root and add your API keys:
   ```
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key
   MONGODB_URI=your_mongodb_connection_string
   GEMINI_API_KEY=your_gemini_api_key
   ```
5. Run the application:
   ```bash
   python app.py
   ```

## API Keys Required
- Google Maps API Key (with Maps JavaScript API, Directions API, and Places API enabled)
- MongoDB Connection String (if using database features)
- Gemini API Key

## Project Structure
```
/
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js
├── templates/
│   └── index.html
├── app.py
├── requirements.txt
└── .env
```
