/**
 * Enhanced 7D Scoring Engine for ClearPath v2.1
 * Dimensions:
 * - Safety (35%)
 * - Congestion (25%)
 * - Reliability (15%)
 * - Accessibility (10%)
 * - Environmental (10%)
 * - Women's Safety (5%)
 */

// Fast distance calculation (Haversine formula optimized)
const PI_OVER_180 = Math.PI / 180;
const calculateDistance = (() => {
  const cache = new Map();
  const KEY_PREFIX = 'd_';
  
  return (lat1, lon1, lat2, lon2) => {
    const key = `${KEY_PREFIX}${lat1}|${lon1}|${lat2}|${lon2}`;
    if (cache.has(key)) return cache.get(key);
    
    const R = 6371;
    const dLat = (lat2 - lat1) * PI_OVER_180;
    const dLon = (lon2 - lon1) * PI_OVER_180;
    const lat1Rad = lat1 * PI_OVER_180;
    const lat2Rad = lat2 * PI_OVER_180;
    
    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const result = R * c;
    
    if (cache.size > 1000) cache.clear(); // Clear cache if too large
    cache.set(key, result);
    return result;
  };
})();

// Time-of-day cache (updated hourly)
let cachedTimeOfDay = null;
let cachedTimeOfDayHour = -1;

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour === cachedTimeOfDayHour) return cachedTimeOfDay;
  
  cachedTimeOfDayHour = hour;
  if (hour >= 22 || hour < 6) cachedTimeOfDay = 'night';
  else if (hour >= 6 && hour < 9) cachedTimeOfDay = 'morning_rush';
  else if (hour >= 9 && hour < 16) cachedTimeOfDay = 'daytime';
  else if (hour >= 16 && hour < 19) cachedTimeOfDay = 'evening_rush';
  else cachedTimeOfDay = 'evening';
  
  return cachedTimeOfDay;
};

// Scoring constants
const SEVERITY_PENALTY = { low: 0.05, medium: 0.15, high: 0.35, critical: 0.60 };
const TIME_OF_DAY_CONGESTION = { 
  morning_rush: 25, 
  evening_rush: 25, 
  daytime: -10, 
  night: -30, 
  evening: 0 
};

class EnhancedScorer {
  constructor(hazards = [], userProfile = {}) {
    this.hazards = hazards || [];
    this.userProfile = userProfile;
    this.timeOfDay = getTimeOfDay();
    this.scoreCache = new Map();
  }

  calculateSafetyScore(route, policeStations = [], crimeData = null) {
    let safetyScore = 75;
    
    // Police proximity (optimized)
    if (policeStations?.length > 0) {
      const distanceToPolice = calculateDistance(
        route.start_lat ?? route.start?.lat ?? 12.97,
        route.start_lon ?? route.start?.lon ?? 77.64,
        policeStations[0].lat,
        policeStations[0].lon
      );
      const proximityScore = Math.max(0, 100 - (distanceToPolice * 10));
      safetyScore = safetyScore * 0.7 + proximityScore * 0.3;
    }
    
    // Crime data impact
    if (crimeData?.incidents) {
      const crimeScore = Math.max(30, 100 - (crimeData.incidents * 5));
      safetyScore = safetyScore * 0.75 + crimeScore * 0.25;
    }
    
    // Lighting and traffic
    const lightingScore = this.timeOfDay === 'night' ? (route.lit_streets ?? 50) : 90;
    safetyScore = safetyScore * 0.75 + lightingScore * 0.25;
    
    if (this.timeOfDay !== 'night' && route.avg_traffic > 30) {
      safetyScore = Math.min(100, safetyScore * 1.05);
    }
    
    const hazardPenalty = this.calculateHazardPenalty(route);
    safetyScore *= (1 - hazardPenalty);
    
    return Math.max(0, Math.min(100, safetyScore));
  }

  calculateCongestionScore(route) {
    let baseCongestion = route.historical_congestion ?? 45;
    baseCongestion += TIME_OF_DAY_CONGESTION[this.timeOfDay] ?? 0;
    
    // Draw from predefined range instead of random
    const trafficVariance = (route.distance_km % 10) * 2; // Deterministic variation
    baseCongestion += trafficVariance;
    
    return Math.max(0, Math.min(100, 100 - baseCongestion));
  }

  calculateReliabilityScore(route) {
    let reliability = 80;
    
    if (route.type === 'highway') reliability -= 15;
    else if (route.type === 'surface_streets') reliability += 10;
    
    const variance = route.time_variance ?? 5;
    const varianceScore = Math.max(30, 100 - (variance * 5));
    reliability = reliability * 0.6 + varianceScore * 0.4;
    
    if (this.timeOfDay === 'morning_rush' || this.timeOfDay === 'evening_rush') {
      reliability -= 15;
    }
    
    return Math.max(0, Math.min(100, reliability));
  }

  calculateAccessibilityScore(route) {
    let accessibility = 75;
    
    const vehicleType = this.userProfile.vehicleType;
    const width = route.width_meters ?? 6;
    
    if (vehicleType === '2-wheeler' && width >= 5) accessibility += 10;
    else if (vehicleType === '4-wheeler' && width >= 7) accessibility += 15;
    else if (vehicleType === 'public' && route.has_public_transit) accessibility += 20;
    
    if (route.wheelchair_accessible) accessibility += 10;
    if (route.has_parking) accessibility += 5;
    if (route.has_ramps) accessibility += 5;
    
    return Math.max(0, Math.min(100, accessibility));
  }

  calculateEnvironmentalScore(route) {
    let envScore = 70;
    
    const airQuality = route.aqi ?? 150;
    const airScore = Math.max(20, 100 - (airQuality / 5));
    envScore = envScore * 0.5 + airScore * 0.5;
    
    const weatherMultipliers = { clear: 1.1, rain: 0.85, fog: 0.8 };
    envScore *= weatherMultipliers[route.weather] ?? 1;
    
    if (route.green_coverage && route.green_coverage > 40) {
      envScore = Math.min(100, envScore * 1.05);
    }
    
    return Math.max(0, Math.min(100, envScore));
  }

  calculateWomensSafetyScore(route) {
    if (this.userProfile.gender !== 'female') return 100;
    
    let womenSafetyScore = 70;
    womenSafetyScore += (route.women_safety_rating ?? 60);
    womenSafetyScore /= 2;
    
    if (this.timeOfDay !== 'night' && route.avg_traffic > 40) {
      womenSafetyScore = Math.min(100, womenSafetyScore * 1.1);
    }
    
    if (route.nearest_police_distance && route.nearest_police_distance < 2) {
      womenSafetyScore = Math.min(100, womenSafetyScore * 1.15);
    }
    
    if (this.timeOfDay === 'night') womenSafetyScore *= 0.7;
    
    return Math.max(0, Math.min(100, womenSafetyScore));
  }

  calculateHazardPenalty(route) {
    if (!this.hazards?.length) return 0;
    
    let penalty = 0;
    const routeLat = route.start_lat ?? route.start?.lat ?? 12.97;
    const routeLon = route.start_lon ?? route.start?.lon ?? 77.64;
    const routeDistance = route.distance_km ?? route.distanceKm ?? 5;
    
    for (const hazard of this.hazards) {
      const distance = calculateDistance(routeLat, routeLon, hazard.lat, hazard.lon);
      
      if (distance < routeDistance) {
        const severityPenalty = SEVERITY_PENALTY[hazard.severity] ?? 0.1;
        const proximityFactor = Math.max(0, 1 - (distance / routeDistance));
        penalty += severityPenalty * proximityFactor;
      }
    }
    
    return Math.min(0.5, penalty);
  }

  calculateCompositeScore(route, policeStations = [], crimeData = null) {
    // Check cache first
    const cacheKey = `${route.id}_${JSON.stringify(this.userProfile)}_${this.timeOfDay}`;
    if (this.scoreCache.has(cacheKey)) {
      return this.scoreCache.get(cacheKey);
    }
    
    const scores = {
      safety: this.calculateSafetyScore(route, policeStations, crimeData),
      congestion: this.calculateCongestionScore(route),
      reliability: this.calculateReliabilityScore(route),
      accessibility: this.calculateAccessibilityScore(route),
      environmental: this.calculateEnvironmentalScore(route),
      womensSafety: this.calculateWomensSafetyScore(route)
    };

    const composite = 
      scores.safety * 0.35 +
      scores.congestion * 0.25 +
      scores.reliability * 0.15 +
      scores.accessibility * 0.10 +
      scores.environmental * 0.10 +
      scores.womensSafety * 0.05;

    const result = {
      composite: Math.round(composite),
      scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.round(v)])),
      recommendation: this.generateRecommendation(composite, scores)
    };
    
    // Cache result
    if (this.scoreCache.size > 500) this.scoreCache.clear();
    this.scoreCache.set(cacheKey, result);
    
    return result;
  }

  generateRecommendation(score, scores) {
    if (score >= 85) return '✅ Excellent - Safe & efficient';
    if (score >= 75) return '🟢 Good - Recommended';
    if (score >= 60) return '🟡 Moderate - Use caution';
    return '🔴 Not recommended';
  }

  scoreAllRoutes(routes, policeStations = [], crimeData = null) {
    return routes.map(route => ({
      ...route,
      ...this.calculateCompositeScore(route, policeStations, crimeData)
    })).sort((a, b) => b.composite - a.composite);
  }

  clearCache() {
    this.scoreCache.clear();
  }
}

module.exports = EnhancedScorer;
