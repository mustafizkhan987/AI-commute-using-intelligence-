import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FaMapMarkerAlt, FaPhone, FaClock, FaCheckCircle, FaAlertTriangle } from 'react-icons/fa';
import './ControlUnitDashboard.css';

function ControlUnitDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [hazards, setHazards] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/v2/control/dashboard');
      const data = await response.json();
      setAlerts(data.emergencyAlerts || []);
      setStats(data.alertStats || {});
      setHazards(data.activeHazards || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const handleAlertResolved = async (alertId) => {
    try {
      await fetch(`/api/v2/control/alert/${alertId}/resolved`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' })
      });
      fetchDashboardData();
      alert('✓ Alert marked as resolved');
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const handleHazardResolved = async (hazardId) => {
    try {
      await fetch(`/api/v2/control/hazard/${hazardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' })
      });
      fetchDashboardData();
      alert('✓ Hazard marked as resolved');
    } catch (error) {
      console.error('Error resolving hazard:', error);
    }
  };

  const filteredAlerts = filter === 'all' ? alerts : alerts.filter(a => a.status === filter);

  const chartData = [
    { time: '00:00', alerts: 2 },
    { time: '04:00', alerts: 1 },
    { time: '08:00', alerts: 6 },
    { time: '12:00', alerts: 10 },
    { time: '16:00', alerts: 12 },
    { time: '20:00', alerts: 8 },
    { time: '23:59', alerts: 3 }
  ];

  const hazardTypeData = [
    { name: 'Construction', value: hazards.filter(h => h.type === 'construction').length || 2 },
    { name: 'Accident', value: hazards.filter(h => h.type === 'accident').length || 1 },
    { name: 'Pothole', value: hazards.filter(h => h.type === 'pothole').length || 3 },
    { name: 'Weather', value: hazards.filter(h => h.type === 'weather').length || 1 }
  ];

  const COLORS = ['#FF6B6B', '#FFA500', '#FFD700', '#4ECDC4'];

  return (
    <div className="control-unit-dashboard">
      <header className="dashboard-header">
        <h1>🚔 Police Control Unit Dashboard</h1>
        <div className="header-info">
          <span className="timestamp">Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </header>

      {/* Key Metrics */}
      <section className="metrics-section">
        <div className="metric-card total">
          <FaAlertTriangle className="icon" />
          <div className="metric-content">
            <span className="label">Total Alerts (24h)</span>
            <span className="value">{stats?.total || 0}</span>
          </div>
        </div>
        <div className="metric-card pending">
          <FaClock className="icon" />
          <div className="metric-content">
            <span className="label">Pending</span>
            <span className="value">{stats?.pending || 0}</span>
          </div>
        </div>
        <div className="metric-card notified">
          <FaPhone className="icon" />
          <div className="metric-content">
            <span className="label">Notified</span>
            <span className="value">{stats?.notified || 0}</span>
          </div>
        </div>
        <div className="metric-card resolved">
          <FaCheckCircle className="icon" />
          <div className="metric-content">
            <span className="label">Resolved</span>
            <span className="value">{stats?.resolved || 0}</span>
          </div>
        </div>
      </section>

      {/* Charts */}
      <section className="charts-section">
        <div className="chart-container">
          <h3>📈 Alerts Timeline (24 hours)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="alerts" stroke="#FF6B6B" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>🛣️ Hazard Types</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={hazardTypeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {hazardTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Active Alerts */}
      <section className="alerts-section">
        <div className="section-header">
          <h2>🚨 Emergency Alerts</h2>
        </div>

        <div className="alerts-grid">
          {filteredAlerts.length === 0 ? (
            <div className="no-data">✓ No alerts at this moment</div>
          ) : (
            filteredAlerts.slice(0, 5).map(alert => (
              <div key={alert.id} className="alert-card" onClick={() => setSelectedAlert(alert)}>
                <div className="alert-header">
                  <span className="status-badge">{alert.status}</span>
                  <span className="severity-badge">{alert.severity}</span>
                </div>
                <div className="alert-body">
                  <h4>{alert.user_name || 'User'}</h4>
                  <p className="incident-type">{alert.incident_type}</p>
                  <p className="time">{new Date(alert.created_at).toLocaleTimeString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Active Hazards */}
      <section className="hazards-section">
        <h2>⚠️ Active Hazards ({hazards.length})</h2>
        <div className="hazards-grid">
          {hazards.length === 0 ? (
            <div className="no-data">✓ No active hazards</div>
          ) : (
            hazards.slice(0, 6).map(hazard => (
              <div key={hazard.id} className="hazard-card">
                <div className="hazard-header">
                  <span className="type-badge">{hazard.type}</span>
                  <span className="severity-badge">{hazard.severity}</span>
                </div>
                <p className="description">{hazard.description}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default ControlUnitDashboard;
