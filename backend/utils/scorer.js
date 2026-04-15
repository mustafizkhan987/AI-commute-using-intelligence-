/**
 * ClearPath Scoring Engine
 * Scores routes on 3 dimensions: Safety, Congestion, Reliability
 * Composite Score = (Safety × 0.40) + ((100 - Congestion) × 0.35) + (Reliability × 0.25)
 */

class CommuteScorer {
  constructor() {
    this.timeOfDay = this.getTimeOfDay();
  }

  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 9) return 'morning_rush';
    if (hour >= 16 && hour < 19) return 'evening_rush';
    if (hour >= 10 && hour < 16) return 'midday';
    return 'night';
  }

  /**
   * Generate dynamic score for a route
   * Scores vary slightly each call to simulate real-time updates
   */
  scoreRoute(routeId, routeName) {
    const variance = () => Math.random() * 8 - 4; // ±4 point variance

    let baseCongestion = 45;
    let baseSafety = 75;
    let baseReliability = 80;

    // Adjust by time of day
    if (this.timeOfDay === 'morning_rush' || this.timeOfDay === 'evening_rush') {
      baseCongestion += 25; // Traffic increases during rush hours
      baseSafety -= 5; // Slight safety decrease due to congestion
    }

    // Route-specific characteristics
    if (routeId === 'route_a') {
      // Highway: normally fast, but vulnerable to accidents
      baseCongestion = Math.max(30, baseCongestion - 15 + variance());
      baseSafety = Math.max(50, baseSafety - 15 + variance()); // Lower safety due to high speeds
      baseReliability = Math.max(60, baseReliability - 10 + variance()); // More variance in travel time
    } else if (routeId === 'route_b') {
      // Downtown: predictable but can get congested
      baseCongestion = Math.max(40, baseCongestion + 10 + variance());
      baseSafety = Math.max(70, baseSafety + 5 + variance()); // Slower = safer
      baseReliability = Math.max(75, baseReliability - 5 + variance());
    } else if (routeId === 'route_c') {
      // Surface streets: consistent but slower
      baseCongestion = Math.max(25, baseCongestion - 20 + variance());
      baseSafety = Math.max(80, baseSafety + 10 + variance()); // Residential = safer
      baseReliability = Math.max(85, baseReliability + 5 + variance()); // Most predictable
    }

    // Clamp values to 0-100
    const congestion = Math.max(0, Math.min(100, baseCongestion));
    const safety = Math.max(0, Math.min(100, baseSafety));
    const reliability = Math.max(0, Math.min(100, baseReliability));

    // Composite score: Safety (40%) + (100-Congestion) (35%) + Reliability (25%)
    const compositeScore = (safety * 0.40) + ((100 - congestion) * 0.35) + (reliability * 0.25);

    return {
      routeId,
      routeName,
      scores: {
        safety: Math.round(safety),
        congestion: Math.round(congestion),
        reliability: Math.round(reliability)
      },
      compositeScore: Math.round(compositeScore),
      recommendation: this.generateRecommendation(
        { safety, congestion, reliability },
        routeName
      )
    };
  }

  generateRecommendation(scores, routeName) {
    const { safety, congestion, reliability } = scores;

    let reason = [];
    if (safety >= 80) reason.push('very safe');
    else if (safety >= 60) reason.push('generally safe');
    else reason.push('some safety concerns');

    if (congestion <= 40) reason.push('light traffic');
    else if (congestion <= 70) reason.push('moderate traffic');
    else reason.push('heavy congestion');

    if (reliability >= 80) reason.push('predictable timing');
    else if (reliability >= 60) reason.push('variable timing');
    else reason.push('unpredictable');

    return `${routeName}: ${reason.join(', ')}.`;
  }

  scoreAllRoutes(routes) {
    return routes.map(route => this.scoreRoute(route.id, route.name));
  }

  getBestRoute(scoredRoutes) {
    return scoredRoutes.reduce((best, current) =>
      current.compositeScore > best.compositeScore ? current : best
    );
  }
}

module.exports = CommuteScorer;
