import React, { useState, useEffect } from 'react';
import RouteCard from './components/RouteCard';
import RecommendationPanel from './components/RecommendationPanel';
import RealTimeMap from './components/RealTimeMap';
import WomensSafetyMode from './components/WomensSafetyMode';
import ControlUnitDashboard from './components/ControlUnitDashboard';
import './App.css';

function App() {
  const [scoredRoutes, setScoredRoutes] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [womenMode, setWomenMode] = useState(false);
  const [activeTab, setActiveTab] = useState('routes');
  const [hazards, setHazards] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [policeStations, setPoliceStations] = useState([]);
  const [userLocation, setUserLocation] = useState({ lat: 12.9716, lon: 77.6412 });
  const [userId, setUserId] = useState(`user_${Math.random().toString(36).substr(2, 9)}`);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [activeIncidents, setActiveIncidents] = useState(0);

  const API_URL = process.env.REACT_APP_API_URL || '';

  // Get user location
   useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lon: longitude });
        },
        error => console.error('Geolocation error:', error)
      );
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(fetchInitialData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [API_URL]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      // Fetch routes and score them
      const routePath = womenMode ? '/api/v2/routes/search?gender=female' : '/api/v2/routes/search';
      const routesRes = await fetch(routePath);
      const routesData = await routesRes.json();

      // Score the routes based on user profile
      const scoringRes = await fetch('/api/v2/score-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routes: routesData.routes || [],
          userProfile: {
            gender: womenMode ? 'female' : 'other',
            vehicleType: '4-wheeler'
          }
        })
      });

      const scoringData = await scoringRes.json();
      setScoredRoutes(scoringData.scoredRoutes || []);
      setRecommendation(scoringData.best);

      // Fetch hazards
      const hazardsRes = await fetch(`/api/v2/hazards/all` || '/api/v2/control/dashboard');
      const hazardsData = await hazardsRes.json();
      setHazards(hazardsData.activeHazards || []);

      // Fetch hospitals
      const hospitalsRes = await fetch(`/api/v2/hospitals/nearest?lat=${userLocation.lat}&lon=${userLocation.lon}`);
      const hospitalsData = await hospitalsRes.json();
      setHospitals(hospitalsData.hospitals || []);

      // Fetch police stations
      const policeRes = await fetch(`/api/v2/nearest-police/${userLocation.lat}/${userLocation.lon}`);
      const policeData = await policeRes.json();
      setPoliceStations(policeData.stations || []);

      // Fetch emergency alerts (for control unit view)
      const alertsRes = await fetch('/api/v2/control/dashboard');
      const alertsData = await alertsRes.json();
      setEmergencyAlerts(alertsData.emergencyAlerts || []);
      setActiveIncidents(alertsData.alertStats?.pending || 0);

      setLastUpdate(new Date().toLocaleTimeString());
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const toggleWomenMode = () => {
    setWomenMode(!womenMode);
  };

  const handleClearPathUpdate = (updateData) => {
    if (updateData.type === 'emergency') {
      setEmergencyAlerts([updateData.alert, ...emergencyAlerts]);
      setActiveIncidents(activeIncidents + 1);
    }
  };

  return (
    <div className="clearpath-app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <h1>🚗 ClearPath</h1>
          <p>AI-Powered Safe Commute Intelligence</p>
        </div>
        <div className="header-controls">
          <button
            className={`mode-toggle ${womenMode ? 'active' : ''}`}
            onClick={toggleWomenMode}
            title="Toggle Women's Safety Mode"
          >
            👩 Women's Mode {womenMode ? '✓' : ''}
          </button>
          <button
            className={`auto-refresh ${autoRefresh ? 'active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            🔄 {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </button>
          <span className="last-update">Last update: {lastUpdate || 'N/A'}</span>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="app-tabs">
        <button
          className={`tab ${activeTab === 'routes' ? 'active' : ''}`}
          onClick={() => setActiveTab('routes')}
        >
          🗺️ Routes ({scoredRoutes.length})
        </button>
        <button
          className={`tab ${activeTab === 'safety' ? 'active' : ''}`}
          onClick={() => setActiveTab('safety')}
        >
          🛡️ Women's Safety
        </button>
        <button
          className={`tab ${activeTab === 'hazards' ? 'active' : ''}`}
          onClick={() => setActiveTab('hazards')}
        >
          ⚠️ Hazards ({hazards.length})
        </button>
        <button
          className={`tab ${activeTab === 'hospitals' ? 'active' : ''}`}
          onClick={() => setActiveTab('hospitals')}
        >
          🏥 Hospitals ({hospitals.length})
        </button>
        <button
          className={`tab ${activeTab === 'control' ? 'active' : ''}`}
          onClick={() => setActiveTab('control')}
        >
          🚔 Control Unit
        </button>
      </nav>

      {/* Main Content */}
      <main className="app-content">
        {loading && <div className="loading">⏳ Loading ClearPath data...</div>}

        {/* Routes Tab */}
        {activeTab === 'routes' && !loading && (
          <div className="routes-container">
            {recommendation && (
              <RecommendationPanel
                recommendation={recommendation}
                womenMode={womenMode}
              />
            )}
            <div className="routes-grid">
              {scoredRoutes.map(route => (
                <RouteCard key={route.id} route={route} womenMode={womenMode} />
              ))}
            </div>
          </div>
        )}

        {/* Women's Safety Tab */}
        {activeTab === 'safety' && (
          <WomensSafetyMode
            womenMode={womenMode}
            setWomenMode={setWomenMode}
            userLocation={userLocation}
            userId={userId}
            onUpdate={handleClearPathUpdate}
          />
        )}

        {/* Hazards Tab */}
        {activeTab === 'hazards' && (
          <div className="hazards-container">
            <div className="section-header">
              <h2>⚠️ Active Street Hazards</h2>
              <p>{hazards.length} hazards reported</p>
            </div>
            <div className="hazards-grid">
              {hazards.map(hazard => (
                <div key={hazard.id} className={`hazard-item severity-${hazard.severity}`}>
                  <div className="hazard-type">{hazard.type}</div>
                  <div className="hazard-severity">{hazard.severity}</div>
                  <div className="hazard-description">{hazard.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hospitals Tab */}
        {activeTab === 'hospitals' && (
          <div className="hospitals-container">
            <div className="section-header">
              <h2>🏥 Nearby Hospitals & Medical Services</h2>
              <p>{hospitals.length} hospitals found</p>
            </div>
            <div className="hospitals-grid">
              {hospitals.map(hospital => (
                <div key={hospital.id} className="hospital-card">
                  <h3>{hospital.name}</h3>
                  <div className="details">
                    <p>📞 {hospital.phone}</p>
                    <p>🚨 Emergency: {hospital.emergency_phone}</p>
                    <p>⏰ Wait time: ~{hospital.wait_time_minutes} min</p>
                    <p>🛏️ Beds available: {hospital.beds_available}</p>
                    <p>⭐ Rating: {hospital.rating}</p>
                    {hospital.specialties && (
                      <p>Specialties: {hospital.specialties.join(', ')}</p>
                    )}
                  </div>
                  <button className="btn-call" onClick={() => window.open(`tel:${hospital.emergency_phone}`)}>
                    Call Emergency
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Control Unit Tab */}
        {activeTab === 'control' && (
          <ControlUnitDashboard />
        )}
      </main>

      {/* Real-time Map (always visible) */}
      <div className="map-container">
        <RealTimeMap
          userLocation={userLocation}
          hazards={hazards}
          hospitals={hospitals}
          policeStations={policeStations}
          routes={scoredRoutes}
        />
      </div>
    </div>
  );
}

export default App;
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>🚗 ClearPath v2.0</h1>
          <p className="tagline">Enhanced AI Commute Intelligence - Bangalore Edition</p>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
          onClick={() => setActiveTab('routes')}
        >
          🛣️ Routes
        </button>
        <button
          className={`tab-btn ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          🗺️ Map
        </button>
        <button
          className={`tab-btn women-tab ${activeTab === 'women' ? 'active' : ''}`}
          onClick={() => setActiveTab('women')}
        >
          👩 Women's Safety
        </button>
        <button
          className={`tab-btn ${activeTab === 'control' ? 'active' : ''}`}
          onClick={() => setActiveTab('control')}
        >
          🎛️ Control
        </button>
      </div>

      {/* Routes Tab */}
      {activeTab === 'routes' && (
        <>
          <div className="controls-panel">
            <button 
              className={`rescan-btn ${loading ? 'loading' : ''}`}
              onClick={scoreRoutes}
              disabled={loading}
            >
              {loading ? '⟳ Scanning...' : '↻ Rescan Routes'}
            </button>
            <label className="auto-refresh-toggle">
              <input 
                type="checkbox" 
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>Auto-refresh</span>
            </label>
            <label className="women-mode-toggle">
              <input 
                type="checkbox" 
                checked={womenMode}
                onChange={(e) => {
                  setWomenMode(e.target.checked);
                  scoreRoutes();
                }}
              />
              <span>👩 Women's Mode</span>
            </label>
            {lastUpdate && <span className="last-update">Last: {lastUpdate}</span>}
          </div>

          {recommendation && (
            <RecommendationPanel 
              recommendation={recommendation}
              routes={scoredRoutes}
              getGradeColor={getGradeColor}
              womenMode={womenMode}
            />
          )}

          <div className="routes-container">
            {scoredRoutes.length > 0 ? (
              scoredRoutes.map((route) => (
                <RouteCard
                  key={route.routeId}
                  route={route}
                  isRecommended={recommendation?.bestRoute === route.routeId}
                  getGradeColor={getGradeColor}
                  getSafetyLabel={getSafetyLabel}
                  getCongestionLabel={getCongestionLabel}
                  womenMode={womenMode}
                />
              ))
            ) : (
              <div className="loading-placeholder">
                <p>Click "Rescan Routes" to start →</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Map Tab */}
      {activeTab === 'map' && (
        <RealTimeMap 
          hazards={hazards} 
          hospitals={hospitals} 
          policeStations={policeStations}
        />
      )}

      {/* Women's Safety Tab */}
      {activeTab === 'women' && (
        <WomensSafetyMode 
          nearestPoliceStation={recommendation?.nearestPoliceStation}
          womenMode={true}
          setWomenMode={() => {}}
        />
      )}

      {/* Control Unit Tab */}
      {activeTab === 'control' && (
        <ControlUnitDashboard />
      )}

      {/* Footer */}
      <footer className="footer">
        <p>🚀 ClearPath v2.0 - Real-time AI Routing with Women's Safety, Hazard Detection & Live Maps</p>
      </footer>
    </div>
  );
}

export default App;
