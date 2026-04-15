import React, { useState, useEffect } from 'react';
import { FaPhone, FaMapMarkerAlt, FaShare, FaExclamationCircle } from 'react-icons/fa';
import './WomensSafetyMode.css';

function WomensSafetyMode({ womenMode, setWomenMode, userLocation, userId, onUpdate }) {
  const [emergencyTriggered, setEmergencyTriggered] = useState(false);
  const [showSOSAnimation, setShowSOSAnimation] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [shareLink, setShareLink] = useState(null);
  const [trustedContacts] = useState([]);

  const handleConfirmEmergency = React.useCallback(async () => {
    try {
      const response = await fetch('/api/v2/women-safety/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || 'user_temp',
          incidentType: 'harassment',
          location: userLocation,
          description: 'Emergency SOS triggered by user'
        })
      });

      const data = await response.json();
      console.log('🚨 Emergency alert sent:', data);

      if (onUpdate) onUpdate({
        type: 'emergency',
        alert: data
      });

      setTimeout(() => {
        alert('✅ Emergency services contacted!\n📍 Your location has been shared with police and trusted contacts.');
      }, 500);

      setEmergencyTriggered(false);
      setShowSOSAnimation(false);
    } catch (error) {
      console.error('❌ Error sending emergency alert:', error);
      alert('Failed to send emergency alert. Please call 1091 immediately.');
    }
  }, [onUpdate, userId, userLocation]);

  useEffect(() => {
    if (countdownSeconds === 0 && emergencyTriggered) {
      handleConfirmEmergency();
      setCountdownSeconds(3);
    }
  }, [countdownSeconds, emergencyTriggered, handleConfirmEmergency]);

  const handleStartLocationSharing = async () => {
    try {
      const response = await fetch('/api/v2/women-safety/share-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || 'user_temp',
          duration: 30,
          sharedWith: trustedContacts.map(c => c.id)
        })
      });

      const data = await response.json();
      setShareLink(data.link);
      setIsLocationSharing(true);

      if (onUpdate) onUpdate({
        type: 'locationSharing',
        shareLink: data.link
      });

      setTimeout(() => {
        alert(`✅ Location sharing started for 30 minutes\n\n📱 Share with contacts:\n${data.link}`);
      }, 500);
    } catch (error) {
      console.error('❌ Error starting location sharing:', error);
    }
  };

  const handleSOSButton = async () => {
    setShowSOSAnimation(true);
    setEmergencyTriggered(true);
    setCountdownSeconds(3);

    const countdown = setInterval(() => {
      setCountdownSeconds(prev => prev - 1);
    }, 1000);

    return () => clearInterval(countdown);
  };

  const handleCancelEmergency = () => {
    setEmergencyTriggered(false);
    setShowSOSAnimation(false);
    setCountdownSeconds(3);
  };

  const handleStopLocationSharing = () => {
    setIsLocationSharing(false);
    setShareLink(null);
    alert('📴 Location sharing stopped');
  };

  const handleReportIncident = async () => {
    const type = prompt('Incident type (harassment/assault/accident/medical):');
    const description = prompt('Brief description:');

    if (!type || !description) return;

    try {
      const response = await fetch('/api/v2/women-safety/report-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || 'user_temp',
          type,
          location: userLocation,
          severity: 'high',
          description
        })
      });

      const data = await response.json();
      alert('📋 Incident reported to authorities');

      if (onUpdate) onUpdate({
        type: 'incidentReport',
        incident: data
      });
    } catch (error) {
      console.error('❌ Error reporting incident:', error);
    }
  };

  return (
    <div className={`womens-safety-container ${womenMode ? 'active' : ''}`}>
      
      {/* Emergency SOS Button */}
      <div className="sos-button-container">
        <div className={`sos-button ${emergencyTriggered ? 'triggered' : ''} ${showSOSAnimation ? 'animate' : ''}`}
             onClick={emergencyTriggered ? handleCancelEmergency : handleSOSButton}>
          <FaExclamationCircle className="sos-icon" />
          <span className="sos-text">SOS</span>
          {emergencyTriggered && (
            <div className="countdown">{countdownSeconds}</div>
          )}
        </div>
        {emergencyTriggered && (
          <div className="sos-warning">
            ⏰ Tap again to cancel in {countdownSeconds}s
          </div>
        )}
      </div>

      {/* Women's Safety Control Panel */}
      <div className="safety-panel">
        
        {/* Status Indicators */}
        <div className="safety-status">
          <div className={`status-item ${womenMode ? 'active' : ''}`}>
            <span className="indicator"></span>
            <span>Women's Mode: {womenMode ? 'ON' : 'OFF'}</span>
          </div>
          <div className={`status-item ${isLocationSharing ? 'active' : ''}`}>
            <span className="indicator"></span>
            <span>Location Sharing: {isLocationSharing ? 'ACTIVE' : 'OFF'}</span>
          </div>
        </div>

        {/* Location Sharing */}
        <div className="location-sharing-section">
          <h3>📍 Location Sharing</h3>
          <div className="share-buttons">
            {!isLocationSharing ? (
              <button className="btn btn-share" onClick={handleStartLocationSharing}>
                <FaShare className="icon" /> Start Sharing (30 min)
              </button>
            ) : (
              <>
                <div className="share-link-box">
                  <span>🔗 {shareLink}</span>
                </div>
                <button className="btn btn-stop" onClick={handleStopLocationSharing}>
                  Stop Sharing
                </button>
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <h3>⚡ Quick Actions</h3>
          <div className="action-buttons">
            <button className="btn btn-call" onClick={() => window.open('tel:1091')}>
              <FaPhone className="icon" /> Call Police (1091)
            </button>
            <button className="btn btn-report" onClick={handleReportIncident}>
              <FaMapMarkerAlt className="icon" /> Report Incident
            </button>
          </div>
        </div>

        {/* Safety Information */}
        <div className="safety-info">
          <h3>📋 Safe Navigation Tips</h3>
          <ul>
            <li>✓ Stick to well-lit, crowded routes</li>
            <li>✓ Keep your phone charged and visible</li>
            <li>✓ Trust your instincts - take a detour if needed</li>
            <li>✓ Share location with trusted contacts</li>
            <li>✓ Keep emergency contacts handy</li>
          </ul>
        </div>

      </div>
    </div>
  );
}

export default WomensSafetyMode;

