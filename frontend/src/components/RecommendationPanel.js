import React from 'react';

function RecommendationPanel({ recommendation, getGradeColor }) {
  const bestRoute = recommendation;

  if (!bestRoute) return null;

  // Support both property shapes from different backend AI routes
  const name = bestRoute.name || bestRoute.routeName || 'Recommended Route';
  const recText = bestRoute.recommendation || 'Fastest and safest commute according to AI.';
  const composite = bestRoute.composite || bestRoute.compositeScore || 0;
  const scores = bestRoute.scores || {};

  return (
    <div className="recommendation-panel">
      <div className="recommendation-header">
        <h2>🎯 AI Recommendation</h2>
      </div>

      <div className="recommendation-content">
        <div className="recommendation-route">
          <h3>{name}</h3>
          <p className="recommendation-reason">{recText}</p>
        </div>

        <div className="improvement-metric">
          <span className="label">AI Composite Score</span>
          <span className="value" style={{ color: getGradeColor(composite) }}>
            {Math.round(composite)} / 100
          </span>
        </div>

        <div className="recommendation-badges">
          {scores.safety >= 75 && (
            <span className="badge safety">🛡️ Safe</span>
          )}
          {scores.congestion <= 50 && (
            <span className="badge traffic">🚗 Light Traffic</span>
          )}
          {scores.reliability >= 75 && (
            <span className="badge reliable">⏱️ Reliable</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecommendationPanel;
