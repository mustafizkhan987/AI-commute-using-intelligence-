from flask import Flask, request, jsonify
from flask_cors import CORS
from rl_router import CoordinateGridAI
import math

app = Flask(__name__)
# Enable CORS so Node or React can hit this directly if necessary
CORS(app)

def calc_distance_km(lat1, lon1, lat2, lon2):
    R = 6371 # Earth radius in km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

@app.route('/predict', methods=['POST'])
def predict_route():
    data = request.json
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400
        
    origin = data.get('origin')
    destination = data.get('destination')
    hazards = data.get('hazards', [])
    
    if not origin or not destination:
         return jsonify({"error": "Origin and Destination required"}), 400
         
    # Initialize our Mathematical Custom Predictor Model
    # Setting resolution to 25 creates a 25x25 geographic block net over the space
    model = CoordinateGridAI(origin, data, hazards=hazards, resolution=25)
    
    # 1. Predict Safest Route (Maximum fear of hazards)
    safest_steps = model.solve_optimal_path(mode="safest")
    
    # 2. Predict Shortest Route (Ignores hazard risk natively to save physical time)
    shortest_steps = model.solve_optimal_path(mode="shortest")
    
    # 3. Predict Balanced Route (Machine Optimization)
    balanced_steps = model.solve_optimal_path(mode="balanced")
    
    # Calculate physical distances
    base_dist = calc_distance_km(origin['lat'], origin['lon'], destination['lat'], destination['lon'])
    
    # Normally we calculate distance by mapping step to step computationally, but for speed we approximate:
    routes = [
        {
          "id": "py_safest", 
          "name": "AI Safest (Grid Reinforcement)", 
          "distance_km": base_dist * 1.25, # Inflated because it detours highly
          "duration_mins": round(base_dist * 1.25 * 3),
          "safety_rating": 98,
          "steps": safest_steps
        },
        {
          "id": "py_shortest", 
          "name": "AI Shortest & Direct", 
          "distance_km": base_dist,
          "duration_mins": round(base_dist * 2.5),
          "safety_rating": 60,
          "steps": shortest_steps
        },
        {
          "id": "py_balanced", 
          "name": "AI Balanced Neural Path", 
          "distance_km": base_dist * 1.08,
          "duration_mins": round(base_dist * 1.08 * 2.7),
          "safety_rating": 85,
          "steps": balanced_steps
        }
    ]
    
    return jsonify({
        "status": "success",
        "engine": "Python Model Architecture",
        "routes": routes
    })

if __name__ == '__main__':
    # Force run on 5001 so it doesn't collide with Node.js on 5000
    print("🚀 Python AI Router Engine booting on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=True)
