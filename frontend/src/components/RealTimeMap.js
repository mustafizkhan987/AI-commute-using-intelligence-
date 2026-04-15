import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import './RealTimeMap.css';

// Custom marker icons
const hazardIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjRkY2RjAwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMjAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPijiguKHkTwvdGV4dD48L3N2Zz4=',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

const hospitalIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjNDRCRDMyIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMjAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPvCokJTvhKc8L3RleHQ+PC9zdmc+',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

const policeIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjMDAzMzk5Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMjAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPvCoomY8L3RleHQ+PC9zdmc+',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

const userIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNCIgZmlsbD0iIzFBNzNFOCIvPjxjaXJjbGUgY3g9IjE2IiBjeT0iMTYiIHI9IjgiIGZpbGw9IndoaXRlIi8+PC9zdmc+',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

// Component to dynamically center the map
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

function RealTimeMap({ userLocation, routes = [], hazards = [], hospitals = [], policeStations = [] }) {
  const mapCenter = userLocation ? [userLocation.lat, userLocation.lon] : [12.9716, 77.5946];
  const mapContainerStyle = {
    width: '100%',
    height: '600px'
  };

  return (
    <div className="realtime-map-container">
      <h3>🗺️ Real-Time Bangalore Map</h3>
      
      <MapContainer center={mapCenter} zoom={13} style={mapContainerStyle} scrollWheelZoom={true}>
        <ChangeView center={mapCenter} />
        
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />

        {/* Current User Location */}
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lon]} icon={userIcon}>
            <Popup>
              <strong>You are here!</strong>
            </Popup>
          </Marker>
        )}

        {/* Render Routes */}
        {routes.map((route, idx) => {
          if (!route.steps || route.steps.length === 0) return null;
          // Build polyline array from steps
          const positions = route.steps.map(s => [s.location.lat, s.location.lng]);
          // Include origin if possible
          if (userLocation) {
            positions.unshift([userLocation.lat, userLocation.lon]);
          }
          const isRecommended = idx === 0;
          return (
            <Polyline 
              key={`route-${idx}`} 
              positions={positions} 
              color={isRecommended ? '#1a73e8' : '#9aa0a6'} // Primary blue for recommendation, gray for others
              weight={isRecommended ? 6 : 4}
              opacity={isRecommended ? 0.9 : 0.6}
            />
          );
        })}

        {/* Heatmap Layer - Rendered heavily beneath precise markers */}
        {hazards.map((hazard) => (
          <Circle
            key={`heat-${hazard.id}`}
            center={[hazard.coords[0], hazard.coords[1]]}
            radius={hazard.severity === 'critical' ? 400 : hazard.severity === 'high' ? 300 : 200}
            pathOptions={{
              color: 'transparent',
              fillColor: '#FF6F00',
              fillOpacity: hazard.severity === 'critical' ? 0.5 : 0.3,
            }}
          />
        ))}

        {/* Hazards */}
        {hazards.map((hazard) => (
          <Marker key={hazard.id} position={[hazard.coords[0], hazard.coords[1]]} icon={hazardIcon}>
            <Popup>
              <div className="popup-content">
                <h4>⚠️ {hazard.type}</h4>
                <p><strong>Severity:</strong> {hazard.severity}</p>
                <p><strong>Status:</strong> {hazard.status}</p>
                <p>{hazard.description}</p>
                <small>Reported: {new Date(hazard.reportedAt).toLocaleString()}</small>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Hospitals */}
        {hospitals.map((hospital) => (
          <Marker key={hospital.id} position={hospital.coordinates} icon={hospitalIcon}>
            <Popup>
              <div className="popup-content">
                <h4>🏥 {hospital.name}</h4>
                <p><strong>Phone:</strong> <a href={`tel:${hospital.phone}`}>{hospital.phone}</a></p>
                <p><strong>Beds:</strong> {hospital.beds}</p>
                <p><strong>Emergency:</strong> {hospital.emergency ? '✓ Yes' : 'No'}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Police Stations */}
        {policeStations.map((station) => (
          <Marker key={station.id} position={station.coordinates} icon={policeIcon}>
            <Popup>
              <div className="popup-content">
                <h4>🚔 {station.name}</h4>
                <p><strong>Phone:</strong> <a href={`tel:${station.phone}`}>{station.phone}</a></p>
                <p><strong>Women Helpline:</strong> <a href={`tel:${station.women_helpline}`}>{station.women_helpline}</a></p>
                <p><strong>Response Time:</strong> {station.response_time_avg}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Safety zones - circles around hospitals */}
        {hospitals.map((hospital) => (
          <Circle
            key={`circle-${hospital.id}`}
            center={hospital.coordinates}
            radius={800}
            pathOptions={{
              color: '#44BD32',
              fillColor: '#44BD32',
              fillOpacity: 0.1,
              weight: 2,
              dashArray: '5, 5'
            }}
          >
            <Popup>Safe Zone: Range of {hospital.name}</Popup>
          </Circle>
        ))}
      </MapContainer>

      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-icon" style={{ backgroundColor: '#FF6F00' }}>⚠️</span>
          <span>Hazard/Incident</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ backgroundColor: '#44BD32' }}>🏥</span>
          <span>Hospital</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ backgroundColor: '#003399' }}>🚔</span>
          <span>Police Station</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ borderColor: '#44BD32', background: 'transparent' }}>⭕</span>
          <span>Safe Zone</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ backgroundColor: '#1A73E8', borderRadius: '50%' }}>⚪</span>
          <span>You</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon" style={{ backgroundColor: '#1A73E8', height: '6px', width: '24px', display: 'inline-block' }}></span>
          <span>Route</span>
        </div>
      </div>
    </div>
  );
}

// Export with React.memo to prevent expensive re-renders when parent state unrelated to map changes
export default React.memo(RealTimeMap);
