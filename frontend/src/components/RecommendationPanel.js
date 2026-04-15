import React from 'react';

function RecommendationPanel({ recommendation, routes, getGradeColor }) {
  const bestRoute = routes.find(r => r.routeId === recommendation.bestRoute);

  if (!bestRoute) return null;

  const improvement = () => {
    const otherScores = routes
      .filter(r => r.routeId !== recommendation.bestRoute)
      .map(r => r.compositeScore);
    if (otherScores.length === 0) return 0;
    return Math.max(...otherScores);
  };

  return (
    <div className="recommendation-panel">
      <div className="recommendation-header">
        <h2>🎯 AI Recommendation</h2>
      </div>

      <div className="recommendation-content">
        <div className="recommendation-route">
          <h3>{bestRoute.routeName}</h3>
          <p className="recommendation-reason">{bestRoute.recommendation}</p>
        </div>

        <div className="improvement-metric">
          <span className="label">Better than alternatives by</span>
          <span className="value">
            {(bestRoute.compositeScore - improvement()).toFixed(1)} points
          </span>
        </div>

        <div className="recommendation-badges">
          {bestRoute.scores.safety >= 75 && (
            <span className="badge safety">🛡️ Safe</span>
          )}
          {bestRoute.scores.congestion <= 50 && (
            <span className="badge traffic">🚗 Light Traffic</span>
          )}
          {bestRoute.scores.reliability >= 75 && (
            <span className="badge reliable">⏱️ Reliable</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecommendationPanel;
