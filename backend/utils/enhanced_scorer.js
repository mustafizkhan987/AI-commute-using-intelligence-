/**
 * Enhanced 7D Scoring Engine for ClearPath
 * Dimensions:
 * - Safety (35%)
 * - Congestion (25%)
 * - Reliability (15%)
 * - Accessibility (10%)
 * - Environmental (10%)
 * - Women's Safety (5%)
 */

class EnhancedScorer {
  constructor(hazards = [], userProfile = {}) {
    this.hazards = hazards;
    this.userProfile = userProfile;
    this.timeOfDay = this.getTimeOfDay();
  }

  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) return 'night';
    if (hour >= 6 && hour < 9) return 'morning_rush';
    if (hour >= 9 && hour < 16) return 'daytime';
    if (hour >= 16 && hour < 19) return 'evening_rush';
    return 'evening';
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  calculateSafetyScore(route, policeStations = [], crimeData = null) {
    let safetyScore = 75;
    if (policeStations && policeStations.length > 0) {
      const nearestPolice = policeStations[0];
      const distanceToPolice = this.calculateDistance(
        route.start.lat, route.start.lon,
        nearestPolice.lat, nearestPolice.lon
      );
      const proximityScore = Math.max(0, 100 - (distanceToPolice * 10));
      safetyScore = safetyScore * 0.7 + proximityScore * 0.3;
    }
    if (crimeData) {
      const crimeScore = Math.max(30, 100 - (crimeData.incidents * 5));
      safetyScore = safetyScore * 0.75 + crimeScore * 0.25;
    }
    const lightingScore = this.timeOfDay === 'night' ? (route.litStreets || 50) : 90;
    safetyScore = safetyScore * 0.75 + lightingScore * 0.25;
    if (this.timeOfDay !== 'night' && route.avgTraffic > 30) {
      safetyScore = Math.min(100, safetyScore * 1.05);
    }
    const hazardPenalty = this.calculateHazardPenalty(route);
    safetyScore *= (1 - hazardPenalty);
    return Math.max(0, Math.min(100, safetyScore));
  }

  calculateCongestionScore(route) {
    let baseCongestion = route.historicalCongestion || 45;
    if (this.timeOfDay === 'morning_rush' || this.timeOfDay === 'evening_rush') {
      baseCongestion += 25;
    } else if (this.timeOfDay === 'daytime') {
      baseCongestion -= 10;
    } else if (this.timeOfDay === 'night') {
      baseCongestion -= 30;
    }
    const liveAdjustment = (Math.random() - 0.5) * 10;
    baseCongestion += liveAdjustment;
    const congestionScore = Math.max(0, 100 - baseCongestion);
    return Math.max(0, Math.min(100, congestionScore));
  }

  calculateReliabilityScore(route) {
    let reliability = 80;
    if (route.type === 'highway') {
      reliability -= 15;
    } else if (route.type === 'surface_streets') {
      reliability += 10;
    }
    const variance = route.timeVariance || 5;
    const varianceScore = Math.max(30, 100 - (variance * 5));
    reliability = reliability * 0.6 + varianceScore * 0.4;
    if (this.timeOfDay === 'morning_rush' || this.timeOfDay === 'evening_rush') {
      reliability -= 15;
    }
    return Math.max(0, Math.min(100, reliability));
  }

  calculateAccessibilityScore(route) {
    let accessibility = 75;
    if (this.userProfile.vehicleType === '2-wheeler' && route.widthMeters >= 5) {
      accessibility += 10;
    } else if (this.userProfile.vehicleType === '4-wheeler' && route.widthMeters >= 7) {
      accessibility += 15;
    } else if (this.userProfile.vehicleType === 'public' && route.hasPublicTransit) {
      accessibility += 20;
    }
    if (route.wheelchairAccessible) accessibility += 10;
    if (route.hasParking) accessibility += 5;
    if (route.hasRamps) accessibility += 5;
    return Math.max(0, Math.min(100, accessibility));
  }

  calculateEnvironmentalScore(route) {
    let envScore = 70;
    const airQuality = route.aqi || 150;
    const airScore = Math.max(20, 100 - (airQuality / 5));
    envScore = envScore * 0.5 + airScore * 0.5;
    if (route.weather === 'clear') {
      envScore = Math.min(100, envScore * 1.1);
    } else if (route.weather === 'rain') {
      envScore *= 0.85;
    } else if (route.weather === 'fog') {
      envScore *= 0.8;
    }
    if (route.greenCoverage && route.greenCoverage > 40) {
      envScore = Math.min(100, envScore * 1.05);
    }
    return Math.max(0, Math.min(100, envScore));
  }

  calculateWomensSafetyScore(route) {
    if (this.userProfile.gender !== 'female') {
      return 100;
    }
    let womenSafetyScore = 70;
    womenSafetyScore += (route.womenSafetyRating || 60);
    womenSafetyScore /= 2;
    if (this.timeOfDay !== 'night' && route.avgTraffic > 40) {
      womenSafetyScore = Math.min(100, womenSafetyScore * 1.1);
    }
    if (route.nearestPoliceDistance && route.nearestPoliceDistance < 2) {
      womenSafetyScore = Math.min(100, womenSafetyScore * 1.15);
    }
    if (this.timeOfDay === 'night') {
      womenSafetyScore *= 0.7;
    }
    return Math.max(0, Math.min(100, womenSafetyScore));
  }

  calculateHazardPenalty(route) {
    let penalty = 0;
    this.hazards.forEach(hazard => {
      const distance = this.calculateDistance(
        route.start.lat, route.start.lon,
        hazard.lat, hazard.lon
      );
      if (distance < route.distanceKm) {
        const severityPenalty = { low: 0.05, medium: 0.15, high: 0.35, critical: 0.60 }[hazard.severity] || 0.1;
        const proximityPenalty = Math.max(0, 1 - (distance / route.distanceKm));
        penalty += severityPenalty * proximityPenalty;
      }
    });
    return Math.min(0.5, penalty);
  }

  calculateCompositeScore(route, policeStations = [], crimeData = null) {
    const safety = this.calculateSafetyScore(route, policeStations, crimeData);
    const congestion = this.calculateCongestionScore(route);
    const reliability = this.calculateReliabilityScore(route);
    const accessibility = this.calculateAccessibilityScore(route);
    const environmental = this.calculateEnvironmentalScore(route);
    const womensSafety = this.calculateWomensSafetyScore(route);

    const composite =
      (safety * 0.35) +
      (congestion * 0.25) +
      (reliability * 0.15) +
      (accessibility * 0.10) +
      (environmental * 0.10) +
      (womensSafety * 0.05);

    return {
      composite: Math.round(composite),
      scores: {
        safety: Math.round(safety),
        congestion: Math.round(congestion),
        reliability: Math.round(reliability),
        accessibility: Math.round(accessibility),
        environmental: Math.round(environmental),
        womensSafety: Math.round(womensSafety)
      },
      recommendation: this.generateRecommendation(composite, { safety, congestion, reliability })
    };
  }

  generateRecommendation(score, scores) {
    if (score >= 85) {
      return 'Excellent choice - Safe and efficient route';
    } else if (score >= 75) {
      return 'Good route - Check conditions';
    } else if (score >= 60) {
      return 'Viable option - Use caution';
    } else {
      return 'Not recommended - Consider alternatives';
    }
  }

  scoreAllRoutes(routes, policeStations = [], crimeData = null) {
    return routes.map(route => ({
      ...route,
      ...this.calculateCompositeScore(route, policeStations, crimeData)
    })).sort((a, b) => b.composite - a.composite);
  }
}

module.exports = EnhancedScorer;
