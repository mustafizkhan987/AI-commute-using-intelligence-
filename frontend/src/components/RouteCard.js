import React from 'react';

function RouteCard({ route, isRecommended, womenMode, getGradeColor, getSafetyLabel, getCongestionLabel, getGradeBg }) {
  // Support both `composite` and `compositeScore` field names from the API
  const composite = route.composite ?? route.compositeScore ?? 0;
  const scores    = route.scores || {};
  const name      = route.name || route.routeName || `Route ${route.id || ''}`;
  const recText   = route.recommendation || '';

  const Ring = ({ value, label, colorFn }) => {
    const color = colorFn(value);
    const r = 38;
    const circ = 2 * Math.PI * r;
    const offset = circ - (value / 100) * circ;
    return (
      <div className="cp-score-cell">
        <div className="cp-score-ring">
          <svg width="90" height="90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
            <circle
              cx="45" cy="45" r={r}
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${circ}`}
              strokeDashoffset={offset}
              transform="rotate(-90 45 45)"
              style={{ transition: 'stroke-dashoffset 0.7s ease' }}
            />
            <text x="45" y="50" textAnchor="middle" fontSize="18" fontWeight="800" fill={color}>
              {Math.round(value)}
            </text>
          </svg>
        </div>
        <span className="cp-score-label-sm">{label}</span>
      </div>
    );
  };

  return (
    <div className={`cp-route-card${isRecommended ? ' recommended' : ''}`}>
      {isRecommended && (
        <div className="cp-rec-badge">⭐ Best Route</div>
      )}

      <h3 className="cp-route-name">{name}</h3>
      {recText && <p className="cp-route-rec-text">{recText}</p>}

      <div className="cp-scores-row">
        <Ring value={scores.safety      ?? 0} label="Safety"      colorFn={getGradeColor} />
        <Ring value={scores.congestion  ?? 0} label="Congestion"  colorFn={getGradeColor} />
        <Ring value={scores.reliability ?? 0} label="Reliability" colorFn={getGradeColor} />
      </div>

      {womenMode && scores.womensSafety != null && (
        <div className="cp-scores-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Ring value={scores.womensSafety}    label="Women Safety"   colorFn={getGradeColor} />
          <Ring value={scores.accessibility ?? 0} label="Accessibility" colorFn={getGradeColor} />
          <Ring value={scores.environmental ?? 0} label="Environment"   colorFn={getGradeColor} />
        </div>
      )}

      <div className="cp-composite-bar-wrap">
        <div className="cp-composite-top">
          <span>Composite Score</span>
          <span style={{ color: getGradeColor(composite) }}>{Math.round(composite)} / 100</span>
        </div>
        <div className="cp-bar-bg">
          <div
            className="cp-bar-fill"
            style={{ width: `${composite}%`, background: `linear-gradient(90deg, ${getGradeColor(composite)}, ${getGradeColor(composite)}aa)` }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {getSafetyLabel(scores.safety ?? 0)}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {getCongestionLabel(scores.congestion ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default React.memo(RouteCard);
