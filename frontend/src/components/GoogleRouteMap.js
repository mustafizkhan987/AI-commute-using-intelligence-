import React, { useState, useEffect } from 'react';
import { GoogleMap, DirectionsService, DirectionsRenderer, Polyline, Marker, InfoWindow } from '@react-google-maps/api';

const mapContainerStyle = {
  width: '100%',
  height: '400px',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
  margin: '20px 0'
};

const defaultCenter = { lat: 12.9716, lng: 77.5946 }; // Bangalore

const GoogleRouteMap = ({ origin, destination, isLoaded, selectedRouteIndex = 0, routes = [], userLocation, hospitals = [], policeStations = [] }) => {
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [activeMarker, setActiveMarker] = useState(null);
  
  useEffect(() => {
    // If the origin or dest completely changes, force a refetch
    setDirectionsResponse(null);
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon]);

  const directionsCallback = (response) => {
    if (response !== null) {
      if (response.status === 'OK') {
        setDirectionsResponse(response);
      } else {
        console.log('Directions request failed due to: ', response.status);
      }
    }
  };

  if (!isLoaded) return (
    <div className="cp-loading-state" style={{ height: '400px', margin: '20px 0', borderRadius: '12px' }}>
      Loading Google Maps Engine...
    </div>
  );

  // Convert custom objects to Google formatting if needed
  const googleOrigin = origin ? { lat: origin.lat, lng: origin.lon || origin.lng } : null;
  const googleDest = destination ? { lat: destination.lat, lng: destination.lon || destination.lng } : null;

  return (
    <div className="google-map-wrapper">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={googleOrigin || defaultCenter}
        zoom={googleOrigin ? 14 : 12}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false
        }}
      >
        {/* API-Based Route (If Key Provided) */}
        {googleOrigin && googleDest && !directionsResponse && process.env.REACT_APP_GOOGLE_MAPS_KEY && (
          <DirectionsService
            options={{
              origin: googleOrigin,
              destination: googleDest,
              travelMode: 'DRIVING',
              provideRouteAlternatives: true
            }}
            callback={directionsCallback}
          />
        )}

        {directionsResponse && (
          <DirectionsRenderer
            options={{
              directions: directionsResponse,
              routeIndex: selectedRouteIndex, 
              polylineOptions: {
                strokeColor: '#1a73e8',
                strokeWeight: 6,
                strokeOpacity: 0.9
              }
            }}
          />
        )}

        {/* AI Machine Model Mock Fallback Renderer (Draws raw polyline coords) */}
        {!directionsResponse && routes.length > 0 && routes.map((route, idx) => {
          if (!route.steps || route.steps.length === 0) return null;
          
          const path = route.steps.map(s => ({
            lat: Number(s.location.lat),
            lng: Number(s.location.lng || s.location.lon)
          }));
          
          const isSelected = idx === selectedRouteIndex;

          return (
            <Polyline
              key={`poly-${idx}`}
              path={path}
              options={{
                strokeColor: isSelected ? '#1a73e8' : '#9aa0a6',
                strokeWeight: isSelected ? 6 : 4,
                strokeOpacity: isSelected ? 1.0 : 0.6,
                zIndex: isSelected ? 10 : 1
              }}
            />
          );
        })}

        {/* ── Live Tracking & Point of Interest Markers ── */}
        
        {/* User's Live Position */}
        {userLocation && (
          <Marker
            position={{ lat: Number(userLocation.lat), lng: Number(userLocation.lon) }}
            label={{ text: '🔵', fontSize: '18px' }}
            title="Your Live Location"
            zIndex={100}
          />
        )}

        {/* Source and Destination Markers (if distinct from userLocation) */}
        {googleOrigin && (
          <Marker position={googleOrigin} label={{ text: 'A', fontWeight: 'bold' }} title="Source" />
        )}
        {googleDest && (
          <Marker position={googleDest} label={{ text: 'B', fontWeight: 'bold' }} title="Destination" />
        )}

        {/* Hospital Markers */}
        {hospitals.map((h, i) => (
          h.lat && h.lon ? (
            <Marker
              key={`hosp-${i}`}
              position={{ lat: Number(h.lat), lng: Number(h.lon) }}
              label={{ text: '🏥', fontSize: '18px' }}
              onClick={() => setActiveMarker({ type: 'hospital', data: h })}
              title={h.name || 'Hospital'}
            />
          ) : null
        ))}

        {/* Police Station Markers */}
        {policeStations.map((p, i) => (
          p.lat && p.lon ? (
            <Marker
              key={`pol-${i}`}
              position={{ lat: Number(p.lat), lng: Number(p.lon) }}
              label={{ text: '🚓', fontSize: '18px' }}
              onClick={() => setActiveMarker({ type: 'police', data: p })}
              title={p.name || 'Police Station'}
            />
          ) : null
        ))}

        {/* Active Marker InfoWindow Popups */}
        {activeMarker && (
          <InfoWindow
            position={{ lat: Number(activeMarker.data.lat), lng: Number(activeMarker.data.lon) }}
            onCloseClick={() => setActiveMarker(null)}
          >
            <div style={{ color: '#000', padding: '10px', minWidth: '150px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                {activeMarker.data.name}
              </h4>
              {activeMarker.type === 'hospital' && (
                <>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Wait Time:</strong> {activeMarker.data.wait_time_minutes} mins</p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Distance:</strong> {activeMarker.data.distance_km} km</p>
                  <p style={{ margin: '4px 0', fontSize: '13px', color: '#f39c12' }}><strong>Rating:</strong> ⭐ {activeMarker.data.rating}</p>
                </>
              )}
              {activeMarker.type === 'police' && (
                <>
                  <p style={{ margin: '4px 0', fontSize: '13px', color: '#d93025' }}><strong>Emergency:</strong> Dial {activeMarker.data.emergency_phone}</p>
                </>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
};

// Export with React.memo
export default React.memo(GoogleRouteMap);
