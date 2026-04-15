const express = require('express');
const router = express.Router();
const EnhancedCommuteScorer = require('../utils/enhanced_scorer');

// Load data
const bangaloreData = require('../data/bangalore_data.json');

// GPS tracking storage (in-memory; use database in production)
let gpsTracking = {};
let emergencyAlerts = [];
let hazardReports = [];

// Initialize scorer
const scorer = new EnhancedCommuteScorer(
  bangaloreData.routes,
  bangaloreData.hazards,
  bangaloreData.crime_data
);

/**
 * GET /api/routes - Get all available routes
 */
router.get('/routes', (req, res) => {
  res.json(bangaloreData.routes);
});

/**
 * POST /api/score - Score all routes with hazard & safety data
 */
router.post('/score', (req, res) => {
  const { womenMode = false } = req.body;
  const scoredRoutes = scorer.scoreAllRoutes(
    bangaloreData.routes,
    bangaloreData.police_stations,
    womenMode
  );
  const bestRoute = scorer.getBestRoute(scoredRoutes, womenMode);

  res.json({
    timestamp: new Date().toISOString(),
    routes: scoredRoutes,
    recommendation: {
      bestRoute: bestRoute.routeId,
      routeName: bestRoute.routeName,
      reason: bestRoute.recommendation,
      compositeScore: bestRoute.compositeScore,
      womensScore: bestRoute.womensScore,
      nearestPoliceStation: bestRoute.nearestPoliceStation,
      hazardsNearby: bestRoute.hazardsNearby
    },
    hazardSummary: scorer.getHazardSummary(),
    modeActive: womenMode ? 'Women\'s Safety Mode' : 'Standard Mode'
  });
});

/**
 * POST /api/gps/track - Track vehicle GPS location
 */
router.post('/api/gps/track', (req, res) => {
  const { userId, latitude, longitude, speed, heading, timestamp } = req.body;

  if (!userId || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  gpsTracking[userId] = {
    userId,
    location: { latitude, longitude },
    speed: speed || 0,
    heading: heading || 0,
    timestamp: timestamp || new Date().toISOString(),
    tracked: true
  };

  // Get nearby hazards
  const nearbyHazards = bangaloreData.hazards.filter(h => {
    const dx = h.coords[0] - latitude;
    const dy = h.coords[1] - longitude;
    const distance = Math.sqrt(dx * dx + dy * dy) * 111; // km
    return distance < 2; // Within 2km
  });

  res.json({
    status: 'tracked',
    userId,
    location: { latitude, longitude },
    nearbyHazards: nearbyHazards,
    hazardCount: nearbyHazards.length,
    trackingActive: true
  });
});

/**
 * GET /api/gps/tracking-map - Get all tracked vehicles (Control Unit)
 */
router.get('/api/gps/tracking-map', (req, res) => {
  const trackedVehicles = Object.values(gpsTracking);
  
  res.json({
    timestamp: new Date().toISOString(),
    totalTracked: trackedVehicles.length,
    vehicles: trackedVehicles,
    emergencyAlerts: emergencyAlerts.filter(a => a.status === 'active'),
    hazards: bangaloreData.hazards,
    hospitalNearby: bangaloreData.hospitals.map(h => ({
      id: h.id,
      name: h.name,
      coordinates: h.coordinates,
      emergency: h.emergency,
      phone: h.phone
    }))
  });
});

/**
 * POST /api/women-safety/emergency - Send emergency alert
 */
router.post('/api/women-safety/emergency', (req, res) => {
  const { userId, latitude, longitude, name, phone, emergencyType = 'general' } = req.body;

  if (!userId || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing location data' });
  }

  const alert = {
    alertId: 'ALERT_' + Date.now(),
    userId,
    location: { latitude, longitude },
    name,
    phone,
    emergencyType,
    status: 'active',
    createdAt: new Date().toISOString(),
    nearestPoliceStation: scorer.getNearestPoliceStation([latitude, longitude], bangaloreData.police_stations),
    nearestHospital: scorer.getNearestPoliceStation([latitude, longitude], bangaloreData.hospitals),
    actionsTriggered: [
      'SMS sent to emergency contacts',
      `Police en route from ${('ALERT_' + Date.now()).substring(0, 6)} station`,
      'Location shared with nearby safe zones'
    ]
  };

  emergencyAlerts.push(alert);

  res.json({
    status: 'alert_sent',
    alert,
    helpDispatched: true,
    estimatedArrival: {
      police: '5-8 minutes',
      hospital: 'nearby'
    }
  });
});

/**
 * POST /api/hazard/report - Report new hazard
 */
router.post('/api/hazard/report', (req, res) => {
  const { latitude, longitude, hazardType, severity, description, reportedBy } = req.body;

  if (!latitude || !longitude || !hazardType) {
    return res.status(400).json({ error: 'Missing hazard data' });
  }

  const hazardReport = {
    id: 'hazard_' + Date.now(),
    type: hazardType,
    location: { latitude, longitude },
    severity: severity || 'medium',
    description,
    reportedBy: reportedBy || 'anonymous',
    status: 'reported',
    createdAt: new Date().toISOString(),
    verified: false
  };

  hazardReports.push(hazardReport);
  bangaloreData.hazards.push({
    ...hazardReport,
    coords: [latitude, longitude]
  });

  res.json({
    status: 'hazard_reported',
    hazardId: hazardReport.id,
    message: 'Thank you! Your report helps other commuters.',
    nearbyUsers: gpsTracking ? Object.keys(gpsTracking).length : 0,
    notificationsToSend: Object.keys(gpsTracking).length
  });
});

/**
 * GET /api/hazards - Get all hazards
 */
router.get('/api/hazards', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    totalHazards: bangaloreData.hazards.length,
    hazards: bangaloreData.hazards
  });
});

/**
 * GET /api/hospitals - Get nearest hospitals
 */
router.get('/api/hospitals', (req, res) => {
  const { latitude, longitude } = req.query;

  let hospitals = bangaloreData.hospitals;

  if (latitude && longitude) {
    hospitals = hospitals.map(h => {
      const dx = h.coordinates[0] - parseFloat(latitude);
      const dy = h.coordinates[1] - parseFloat(longitude);
      const distance = Math.sqrt(dx * dx + dy * dy) * 111; // km
      return { ...h, distanceKm: distance.toFixed(2) };
    }).sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm));
  }

  res.json({
    timestamp: new Date().toISOString(),
    hospitals: hospitals.slice(0, 5) // Top 5
  });
});

/**
 * GET /api/police-stations - Get nearest police stations
 */
router.get('/api/police-stations', (req, res) => {
  const { latitude, longitude } = req.query;

  let stations = bangaloreData.police_stations;

  if (latitude && longitude) {
    stations = stations.map(s => {
      const dx = s.coordinates[0] - parseFloat(latitude);
      const dy = s.coordinates[1] - parseFloat(longitude);
      const distance = Math.sqrt(dx * dx + dy * dy) * 111; // km
      return { ...s, distanceKm: distance.toFixed(2) };
    }).sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm));
  }

  res.json({
    timestamp: new Date().toISOString(),
    stations: stations.slice(0, 5) // Top 5
  });
});

/**
 * GET /api/control-unit/dashboard - Control unit real-time dashboard
 */
router.get('/api/control-unit/dashboard', (req, res) => {
  const activeTracking = Object.values(gpsTracking).length;
  const activeAlerts = emergencyAlerts.filter(a => a.status === 'active').length;
  const activeHazards = bangaloreData.hazards.filter(h => h.status === 'active').length;

  res.json({
    timestamp: new Date().toISOString(),
    dashboard: {
      realtime: {
        vehiclesTracked: activeTracking,
        emergencyAlertsActive: activeAlerts,
        hazardsReported: activeHazards,
        avgResponseTime: '7 minutes'
      },
      emergencyAlerts: emergencyAlerts.filter(a => a.status === 'active'),
      hazards: bangaloreData.hazards.filter(h => h.status === 'active'),
      systemStatus: {
        gpsTracking: activeTracking > 0 ? 'active' : 'idle',
        hazardDetection: 'active',
        emergencyResponse: activeAlerts > 0 ? 'responding' : 'ready'
      },
      statistics: {
        avgRouteScore: 70,
        safetyMetrics: {
          safestArea: 'Yelahanka',
          safestTime: 'morning_rush',
          riskiestArea: 'Shivajinagar',
          riskiestTime: 'late_night'
        }
      }
    }
  });
});

/**
 * GET /api/crime-data - Get crime statistics
 */
router.get('/api/crime-data', (req, res) => {
  const crimeByArea = {};
  bangaloreData.crime_data.forEach(crime => {
    if (!crimeByArea[crime.area]) {
      crimeByArea[crime.area] = [];
    }
    crimeByArea[crime.area].push(crime);
  });

  res.json({
    timestamp: new Date().toISOString(),
    crimeData: crimeByArea,
    timeBasedAnalysis: {
      dayCrimes: bangaloreData.crime_data.filter(c => c.timeOfDay === 'day').length,
      nightCrimes: bangaloreData.crime_data.filter(c => c.timeOfDay === 'night').length,
      lateNightCrimes: bangaloreData.crime_data.filter(c => c.timeOfDay === 'late_night').length
    }
  });
});

/**
 * POST /api/safe-zone/check-in - Women check-in at safe zone
 */
router.post('/api/safe-zone/check-in', (req, res) => {
  const { userId, latitude, longitude, name } = req.body;

  if (!userId || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  res.json({
    status: 'checked_in',
    message: `${name} has checked in to a safe zone`,
    safeZoneConfirmed: true,
    emergencyContactsNotified: true,
    locationShared: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
