import React from 'react';

function RouteCard({ route, isRecommended, getGradeColor, getSafetyLabel, getCongestionLabel }) {
  const { scores, compositeScore, recommendation } = route;

  return (
    <div className={`route-card ${isRecommended ? 'recommended' : ''}`}>
      {isRecommended && <div className="recommended-badge">✓ RECOMMENDED</div>}

      <h2 className="route-name">{route.routeName}</h2>
      <p className="route-description">{recommendation}</p>

      <div className="scores-grid">
        {/* Safety Score */}
        <div className="score-item">
          <div className="score-label">Safety</div>
          <div className="score-gauge">
            <svg viewBox="0 0 100 100" width="120" height="120">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#e0e0e0" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={getGradeColor(scores.safety)}
                strokeWidth="8"
                strokeDasharray={`${(scores.safety / 100) * 283} 283`}
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
              <text x="50" y="55" textAnchor="middle" fontSize="24" fontWeight="bold" fill={getGradeColor(scores.safety)}>
                {scores.safety}
              </text>
            </svg>
          </div>
          <div className="score-status">{getSafetyLabel(scores.safety)}</div>
        </div>

        {/* Congestion Score */}
        <div className="score-item">
          <div className="score-label">Congestion</div>
          <div className="score-gauge">
            <svg viewBox="0 0 100 100" width="120" height="120">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#e0e0e0" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={getGradeColor(100 - scores.congestion)}
                strokeWidth="8"
                strokeDasharray={`${((100 - scores.congestion) / 100) * 283} 283`}
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
              <text x="50" y="55" textAnchor="middle" fontSize="24" fontWeight="bold" fill={getGradeColor(100 - scores.congestion)}>
                {scores.congestion}
              </text>
            </svg>
          </div>
          <div className="score-status">{getCongestionLabel(scores.congestion)}</div>
        </div>

        {/* Reliability Score */}
        <div className="score-item">
          <div className="score-label">Reliability</div>
          <div className="score-gauge">
            <svg viewBox="0 0 100 100" width="120" height="120">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#e0e0e0" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={getGradeColor(scores.reliability)}
                strokeWidth="8"
                strokeDasharray={`${(scores.reliability / 100) * 283} 283`}
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
              <text x="50" y="55" textAnchor="middle" fontSize="24" fontWeight="bold" fill={getGradeColor(scores.reliability)}>
                {scores.reliability}
              </text>
            </svg>
          </div>
          <div className="score-status">
            {scores.reliability >= 80 ? 'Predictable' : scores.reliability >= 60 ? 'Variable' : 'Unpredictable'}
          </div>
        </div>
      </div>

      {/* Composite Score Bar */}
      <div className="composite-score">
        <div className="composite-label">Composite Score</div>
        <div className="score-bar">
          <div
            className="score-fill"
            style={{
              width: `${compositeScore}%`,
              backgroundColor: getGradeColor(compositeScore),
              transition: 'all 0.5s ease'
            }}
          />
        </div>
        <div className="composite-value">
          <span className="score-number">{compositeScore}</span>
          <span className="score-max">/100</span>
        </div>
      </div>
    </div>
  );
}

export default RouteCard;
