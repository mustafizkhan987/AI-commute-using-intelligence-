import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import RouteCard from './components/RouteCard';
import RecommendationPanel from './components/RecommendationPanel';
import GoogleRouteMap from './components/GoogleRouteMap';
import RealTimeMap from './components/RealTimeMap';
import WomensSafetyMode from './components/WomensSafetyMode';
import ControlUnitDashboard from './components/ControlUnitDashboard';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import { FaRoute, FaShieldAlt, FaExclamationTriangle, FaClinicMedical, FaMapMarkedAlt, FaDesktop, FaCar, FaMapMarkerAlt } from 'react-icons/fa';
import './App.css';

// Performance constants (outside component to prevent recreation)
const getOrCreateUserId = () => {
  let id = localStorage.getItem('clearpath_user_id');
  if (!id) {
    id = `user_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
    localStorage.setItem('clearpath_user_id', id);
  }
  return id;
};

// Color utility functions (memoized)
const SCORE_COLORS = {
  excellent: '#10b981', good: '#3b82f6', moderate: '#f59e0b', risky: '#ef4444'
};
const SCORE_BG = {
  excellent: 'rgba(16,185,129,0.15)', good: 'rgba(59,130,246,0.15)',
  moderate: 'rgba(245,158,11,0.15)', risky: 'rgba(239,68,68,0.15)'
};

export const getGradeColor = (score) => {
  if (score >= 85) return SCORE_COLORS.excellent;
  if (score >= 70) return SCORE_COLORS.good;
  if (score >= 55) return SCORE_COLORS.moderate;
  return SCORE_COLORS.risky;
};

export const getGradeBg = (score) => {
  if (score >= 85) return SCORE_BG.excellent;
  if (score >= 70) return SCORE_BG.good;
  if (score >= 55) return SCORE_BG.moderate;
  return SCORE_BG.risky;
};

export const getSafetyLabel = (score) => {
  if (score >= 85) return '✅ Very Safe';
  if (score >= 70) return '🟢 Safe';
  if (score >= 55) return '🟡 Moderate';
  return '🔴 Risky';
};

export const getCongestionLabel = (score) => {
  if (score >= 80) return '🟢 Clear';
  if (score >= 60) return '🟡 Moderate';
  if (score >= 40) return '🟠 Heavy';
  return '🔴 Jammed';
};

const TABS = [
  { id: 'routes', icon: <FaRoute />, label: 'Routes' },
  { id: 'safety', icon: <FaShieldAlt />, label: "Women's Safety" },
  { id: 'hazards', icon: <FaExclamationTriangle />, label: 'Hazards' },
  { id: 'hospitals', icon: <FaClinicMedical />, label: 'Hospitals' },
  { id: 'map', icon: <FaMapMarkedAlt />, label: 'Live Map' },
  { id: 'control', icon: <FaDesktop />, label: 'Control Unit' }
];

const LOCAL_LOCATIONS = [
  { name: 'Koramangala, Bangalore', lat: 12.9279, lon: 77.6271 },
  { name: 'Indiranagar, Bangalore', lat: 12.9783, lon: 77.6408 },
  { name: 'Whitefield, Bangalore', lat: 12.9698, lon: 77.7499 },
  { name: 'Malleshwaram, Bangalore', lat: 13.0031, lon: 77.5701 },
  { name: 'MG Road, Bangalore', lat: 12.9730, lon: 77.6111 },
  { name: 'Jayanagar, Bangalore', lat: 12.9250, lon: 77.5938 },
  { name: 'Electronic City, Bangalore', lat: 12.8452, lon: 77.6601 },
  { name: 'Kempegowda Airport (BLR)', lat: 13.1986, lon: 77.7066 },
];

// ─── Main App ────────────────────────────────────────────────────────────────
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
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState({ lat: 12.9716, lon: 77.6412 });
  const userId = useRef(getOrCreateUserId()).current;
  const intervalRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [routeOrigin, setRouteOrigin] = useState(null);
  const [routeDest, setRouteDest] = useState({ lat: 12.9352, lon: 77.6245 });

  const [sourceSearch, setSourceSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');

  const [simulateInterval, setSimulateInterval] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Custom Local Search Processor
  const handleLocalSearch = (query, isSource) => {
    if (isSource) setSourceSearch(query);
    else setDestSearch(query);
    
    if (query.trim().length < 3) return;

    const lowerQ = query.toLowerCase();
    const match = LOCAL_LOCATIONS.find(loc => loc.name.toLowerCase().includes(lowerQ));
    if (match) {
      if (isSource) setRouteOrigin({ lat: match.lat, lon: match.lon });
      else setRouteDest({ lat: match.lat, lon: match.lon });
    }
  };

  // Initialize Maps API
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY || ''
  });

  // Live GPS tracking using watchPosition
  useEffect(() => {
    let watchId;
    if (navigator.geolocation) {
      // Get initial immediate position
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setUserLocation({ lat: coords.latitude, lon: coords.longitude });
          if (!routeOrigin) setRouteOrigin({ lat: coords.latitude, lon: coords.longitude });
        }
      );
      // Watch for movement
      watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
          setUserLocation({ lat: coords.latitude, lon: coords.longitude });
          // Option: Don't continuously overwrite routeOrigin if the user typed something else
        },
        () => {}, // silently fall back
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    }
    return () => {
      if (watchId && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // ── Fetch all dashboard data (optimized) ──────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Abort previous requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    try {
      const signal = abortControllerRef.current.signal;
      
      const targetOrigin = routeOrigin || userLocation;

      // Parallel fetch with Promise.all
      const [routesRes, scoreRes, dashRes, hospRes, policeRes] = await Promise.all([
        fetch('/api/v2/routes/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: targetOrigin, destination: routeDest }),
          signal
        }),
        (async () => {
          const searchRes = await fetch('/api/v2/routes/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: targetOrigin, destination: routeDest }),
            signal
          });
          const routes = await searchRes.json();
          const scoreRes = await fetch('/api/v2/score-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              routes: routes.routes || [],
              userProfile: { gender: womenMode ? 'female' : 'other', vehicleType: '4-wheeler' }
            }),
            signal
          });
          return scoreRes;
        })(),
        fetch('/api/v2/control/dashboard', { signal }),
        fetch(`/api/v2/hospitals/nearest?lat=${userLocation.lat}&lon=${userLocation.lon}`, { signal }),
        fetch(`/api/v2/nearest-police/${userLocation.lat}/${userLocation.lon}`, { signal })
      ]);

      if (signal.aborted) return;

      // Parse responses
      const scoreData = await scoreRes.json();
      const dashData = await dashRes.json();
      const hospData = await hospRes.json();
      const policeData = await policeRes.json();

      setScoredRoutes(scoreData.scoredRoutes || []);
      setRecommendation(scoreData.best || null);
      setHazards(dashData.activeHazards || []);
      setActiveIncidents(dashData.alertStats?.pending || 0);
      setHospitals(hospData.hospitals || []);
      setPoliceStations(policeData.stations || []);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Fetch error:', err);
        setError('Server connection failed. Check backend.');
      }
    } finally {
      setLoading(false);
    }
  }, [userLocation, routeOrigin, routeDest, womenMode]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh toggle
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 30000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, fetchData]);

  const handleUpdate = useCallback((updateData) => {
    if (updateData.type === 'emergency') {
      setActiveIncidents(prev => prev + 1);
    }
  }, []);

  // Memoized tab data
  const currentTabLabel = useMemo(
    () => TABS.find(t => t.id === activeTab),
    [activeTab]
  );

  // ── Live Tracking Simulator Drone Engine ──
  const toggleSimulation = () => {
    if (isSimulating) {
      clearInterval(simulateInterval);
      setSimulateInterval(null);
      setIsSimulating(false);
      return;
    }

    if (!scoredRoutes || scoredRoutes.length === 0) {
      alert("Please rescan and generate AI routes first.");
      return;
    }

    const steps = scoredRoutes[0].steps || [];
    if (steps.length === 0) return;

    setIsSimulating(true);
    let stepIdx = 0;

    const intervalId = setInterval(() => {
      if (stepIdx >= steps.length) {
        clearInterval(intervalId);
        setIsSimulating(false);
        return;
      }
      
      const loc = steps[stepIdx].location;
      
      // Override the live GPS marker mathematically
      setUserLocation({
        lat: Number(loc.lat),
        lon: Number(loc.lng || loc.lon)
      });
      
      stepIdx++;
    }, 1200); // Drone moves to next waypoint every 1.2 seconds

    setSimulateInterval(intervalId);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="cp-app">
      {/* ── Sidebar Navigation ── */}
      <aside className="cp-sidebar">
        <div className="cp-logo">
          <span className="cp-logo-icon"><FaCar /></span>
          <div>
            <div className="cp-logo-title">ClearPath</div>
            <div className="cp-logo-sub">AI Commute Intelligence</div>
          </div>
        </div>

        <nav className="cp-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`cp-nav-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              id={`nav-${tab.id}`}
              title={tab.label}
            >
              <span className="cp-nav-icon">{tab.icon}</span>
              <span className="cp-nav-label">{tab.label}</span>
              {tab.id === 'hazards' && hazards.length > 0 && (
                <span className="cp-badge">{hazards.length}</span>
              )}
              {tab.id === 'control' && activeIncidents > 0 && (
                <span className="cp-badge red">{activeIncidents}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="cp-sidebar-footer">
          <label className="cp-toggle-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>👩 Women's Mode</span>
            <div
              className={`cp-switch${womenMode ? ' on' : ''}`}
              onClick={() => setWomenMode(m => !m)}
              role="switch"
              aria-checked={womenMode}
              tabIndex={0}
            >
              <div className="cp-switch-thumb" />
            </div>
          </label>
          <label className="cp-toggle-row">
            <span>🔄 Auto-Refresh</span>
            <div
              className={`cp-switch${autoRefresh ? ' on' : ''}`}
              onClick={() => setAutoRefresh(r => !r)}
              role="switch"
              aria-checked={autoRefresh}
              tabIndex={0}
            >
              <div className="cp-switch-thumb" />
            </div>
          </label>
          {lastUpdate && <div className="cp-last-update">✓ {lastUpdate}</div>}
        </div>
      </aside>

      {/* ── Main Panel ── */}
      <main className="cp-main">
        {/* Top bar */}
        <div className="cp-topbar">
          <div className="cp-topbar-title">
            <span>{currentTabLabel?.icon}</span>
            <span>{currentTabLabel?.label}</span>
            {womenMode && <span className="cp-womens-pill">👩 Women's Mode ON</span>}
          </div>
          <button
            className={`cp-rescan-btn${loading ? ' loading' : ''}`}
            onClick={fetchData}
            disabled={loading || isSimulating}
            id="btn-rescan"
            title="Rescan all data"
            style={{ marginRight: '10px' }}
          >
            {loading ? <span className="cp-spinner" /> : '↻'} {loading ? 'Scanning...' : 'Rescan'}
          </button>
          
          {scoredRoutes.length > 0 && activeTab === 'routes' && (
            <button
              className={`cp-rescan-btn`}
              onClick={toggleSimulation}
              title="Simulate Drone Drive"
              style={{ background: isSimulating ? '#d93025' : '#8e24aa' }}
            >
              {isSimulating ? '⏹️ Stop Drive' : '▶️ Simulate Drive'}
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="cp-error-banner" role="alert">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* ── Offline Custom Locator Search Bar ── */}
        {activeTab === 'routes' && (
          <div className="cp-routes-search-bar" style={{ display: 'flex', gap: '15px', padding: '0 30px', marginBottom: '20px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--c-surface-1)', padding: '10px 15px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <FaMapMarkerAlt style={{ color: '#1a73e8', marginRight: '10px' }} />
              <input 
                type="text" 
                value={sourceSearch}
                onChange={(e) => handleLocalSearch(e.target.value, true)}
                placeholder="Offline Source Search (e.g., Koramangala)" 
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '15px', color: 'var(--text-main)' }} 
              />
            </div>
            
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--c-surface-1)', padding: '10px 15px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <FaMapMarkerAlt style={{ color: '#d93025', marginRight: '10px' }} />
              <input 
                type="text" 
                value={destSearch}
                onChange={(e) => handleLocalSearch(e.target.value, false)}
                placeholder="Offline Dest Search (e.g., MG Road)" 
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '15px', color: 'var(--text-main)' }} 
              />
            </div>
          </div>
        )}

        {/* ── Routes Tab ── */}
        {activeTab === 'routes' && (
          <div className="cp-tab-content fade-in">
            {loading && scoredRoutes.length === 0 ? (
              <div className="cp-loading-state">
                <div className="cp-skeleton-card" />
                <div className="cp-skeleton-card" />
                <div className="cp-loading-text">Scanning routes & analyzing safety...</div>
              </div>
            ) : scoredRoutes.length === 0 ? (
              <div className="cp-empty-state">
                <div className="cp-empty-icon"><FaRoute /></div>
                <h3>No Routes Available</h3>
                <p>Click <strong>Rescan</strong> to search for routes from your location.</p>
              </div>
            ) : (
              <>
                {recommendation && (
                  <RecommendationPanel
                    recommendation={recommendation}
                    womenMode={womenMode}
                    getGradeColor={getGradeColor}
                  />
                )}
                <div className="cp-routes-wrapper" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  <div className="cp-routes-list" style={{ flex: '1 1 40%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {scoredRoutes.slice(0, 6).map((route, idx) => (
                      <RouteCard
                        key={route.id || idx}
                        route={route}
                        isRecommended={idx === 0}
                        womenMode={womenMode}
                        getGradeColor={getGradeColor}
                        getSafetyLabel={getSafetyLabel}
                        getCongestionLabel={getCongestionLabel}
                        getGradeBg={getGradeBg}
                      />
                    ))}
                  </div>
                  
                  {/* Native Google Map Visualizer */}
                  <div style={{ flex: '1 1 50%', minWidth: '350px' }}>
                    <GoogleRouteMap 
                      origin={routeOrigin || userLocation}
                      destination={routeDest}
                      isLoaded={isLoaded}
                      routes={scoredRoutes}
                      userLocation={userLocation}
                      hospitals={hospitals}
                      policeStations={policeStations}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Women's Safety Tab ── */}
        {activeTab === 'safety' && (
          <div className="cp-tab-content fade-in">
            <WomensSafetyMode
              womenMode={womenMode}
              setWomenMode={setWomenMode}
              userLocation={userLocation}
              userId={userId}
              policeStations={policeStations}
              hospitals={hospitals}
              onUpdate={handleUpdate}
            />
          </div>
        )}

        {/* ── Hazards Tab ── */}
        {activeTab === 'hazards' && (
          <div className="cp-tab-content fade-in">
            <div className="cp-section-header">
              <h2>⚠️ Active Hazards</h2>
              <span className="cp-count-pill">{hazards.length}</span>
            </div>
            {hazards.length === 0 ? (
              <div className="cp-empty-state">
                <div className="cp-empty-icon" style={{color: '#188038'}}>✓</div>
                <h3>All Clear</h3>
                <p>No active hazards reported on nearby routes.</p>
              </div>
            ) : (
              <div className="cp-hazards-grid">
                {hazards.slice(0, 10).map((h, i) => (
                  <div key={h.id || i} className={`cp-hazard-card sev-${h.severity}`}>
                    <div className="cp-hazard-header">
                      <span className="cp-hazard-type">{h.type || 'Unknown'}</span>
                      <span className={`cp-sev-badge sev-${h.severity}`}>{h.severity}</span>
                    </div>
                    <p className="cp-hazard-desc">{h.description || 'No details'}</p>
                    <div className="cp-hazard-meta">
                      {h.reported_at && (
                        <span>🕒 {new Date(h.reported_at).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Hospitals Tab ── */}
        {activeTab === 'hospitals' && (
          <div className="cp-tab-content fade-in">
            <div className="cp-section-header">
              <h2>🏥 Nearby Hospitals</h2>
              <span className="cp-count-pill">{hospitals.length}</span>
            </div>
            {hospitals.length === 0 ? (
              <div className="cp-empty-state">
                <div className="cp-empty-icon"><FaClinicMedical /></div>
                <h3>No Hospitals Found</h3>
                <p>Try refreshing or move to see hospitals nearby.</p>
              </div>
            ) : (
              <div className="cp-hospitals-grid">
                {hospitals.slice(0, 8).map((h, i) => (
                  <div key={h.id || i} className="cp-hospital-card">
                    <div className="cp-hospital-header">
                      <h3>{h.name || 'Hospital'}</h3>
                      {h.distance_km && (
                        <span className="cp-distance">{Number(h.distance_km).toFixed(1)} km</span>
                      )}
                    </div>
                    <div className="cp-hospital-body">
                      <div className="cp-hospital-stat">
                        <span className="label">⏰ Wait</span>
                        <span className="value">{h.wait_time_minutes ?? '—'} min</span>
                      </div>
                      <div className="cp-hospital-stat">
                        <span className="label">🛏️ Beds</span>
                        <span className="value">{h.beds_available ?? '—'}</span>
                      </div>
                      <div className="cp-hospital-stat">
                        <span className="label">⭐ Rating</span>
                        <span className="value">{h.rating ?? '—'}</span>
                      </div>
                    </div>
                    {h.specialties?.length > 0 && (
                      <div className="cp-specialties">
                        {h.specialties.slice(0, 3).map(s => (
                          <span key={s} className="cp-specialty-tag">{s}</span>
                        ))}
                      </div>
                    )}
                    <div className="cp-hospital-actions">
                      {h.phone && (
                        <button
                          className="cp-btn-call"
                          onClick={() => window.open(`tel:${h.phone}`)}
                          title="Call hospital"
                        >
                          📞 Call
                        </button>
                      )}
                      {h.emergency_phone && (
                        <button
                          className="cp-btn-emergency"
                          onClick={() => window.open(`tel:${h.emergency_phone}`)}
                          title="Emergency line"
                        >
                          🚨 Emergency
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Live Map Tab ── */}
        {activeTab === 'map' && (
          <div className="cp-tab-content fade-in cp-map-wrapper">
            <RealTimeMap
              userLocation={userLocation}
              hazards={hazards}
              hospitals={hospitals}
              policeStations={policeStations}
              routes={scoredRoutes}
            />
          </div>
        )}

        {/* ── Control Unit Tab ── */}
        {activeTab === 'control' && (
          <div className="cp-tab-content fade-in">
            <ControlUnitDashboard />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
