import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import RouteCard from './components/RouteCard';
import RecommendationPanel from './components/RecommendationPanel';
import RealTimeMap from './components/RealTimeMap';
import WomensSafetyMode from './components/WomensSafetyMode';
import ControlUnitDashboard from './components/ControlUnitDashboard';
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
  { id: 'routes', icon: '🛣️', label: 'Routes' },
  { id: 'safety', icon: '🛡️', label: "Women's Safety" },
  { id: 'hazards', icon: '⚠️', label: 'Hazards' },
  { id: 'hospitals', icon: '🏥', label: 'Hospitals' },
  { id: 'map', icon: '🗺️', label: 'Live Map' },
  { id: 'control', icon: '🚔', label: 'Control Unit' },
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
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState({ lat: 12.9716, lon: 77.6412 });
  const userId = useRef(getOrCreateUserId()).current;
  const intervalRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Fetch user geolocation once at mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setUserLocation({ lat: coords.latitude, lon: coords.longitude }),
        () => {} // silently fall back
      );
    }
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
      
      // Parallel fetch with Promise.all
      const [routesRes, scoreRes, dashRes, hospRes, policeRes] = await Promise.all([
        fetch('/api/v2/routes/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: userLocation, destination: { lat: 12.9352, lon: 77.6245 } }),
          signal
        }),
        (async () => {
          const searchRes = await fetch('/api/v2/routes/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: userLocation, destination: { lat: 12.9352, lon: 77.6245 } }),
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
      const routesData = await routesRes.json();
      const scoreData = await scoreRes.json();
      const dashData = await dashRes.json();
      const hospData = await hospRes.json();
      const policeData = await policeRes.json();

      setScoredRoutes(scoreData.scoredRoutes || []);
      setRecommendation(scoreData.best || null);
      setHazards(dashData.activeHazards || []);
      setEmergencyAlerts(dashData.emergencyAlerts || []);
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
  }, [userLocation, womenMode]);

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
      setEmergencyAlerts(prev => [updateData.alert, ...prev].slice(0, 50));
      setActiveIncidents(prev => prev + 1);
    }
  }, []);

  // Memoized tab data
  const currentTabLabel = useMemo(
    () => TABS.find(t => t.id === activeTab),
    [activeTab]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="cp-app">
      {/* ── Sidebar Navigation ── */}
      <aside className="cp-sidebar">
        <div className="cp-logo">
          <span className="cp-logo-icon">🚗</span>
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
            <span>👩 Women's Mode</span>
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
            disabled={loading}
            id="btn-rescan"
            title="Rescan all data"
          >
            {loading ? <span className="cp-spinner" /> : '↻'} {loading ? 'Scanning...' : 'Rescan'}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="cp-error-banner" role="alert">
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
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
                <div className="cp-empty-icon">🛣️</div>
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
                <div className="cp-routes-grid">
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
                <div className="cp-empty-icon">✅</div>
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
                <div className="cp-empty-icon">🏥</div>
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
