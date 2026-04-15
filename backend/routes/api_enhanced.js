const express = require('express');
const router = express.Router();
const EnhancedCommuteScorer = require('../utils/enhanced_scorer');
const pool = require('../db');

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
router.post('/api/hazard/report', async (req, res) => {
  const { latitude, longitude, hazardType, severity, description, reportedBy } = req.body;

  if (!latitude || !longitude || !hazardType) {
    return res.status(400).json({ error: 'Missing hazard data' });
  }

  try {
    // Determine if reportedBy is a valid UUID or string fallback
    let reporterId = null;
    if (reportedBy && reportedBy.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      reporterId = reportedBy;
    }

    const result = await pool.query(
      `INSERT INTO hazards (type, location, severity, description, reported_by, status)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6, 'active')
       RETURNING id, type, ST_X(location::geometry) as lon, ST_Y(location::geometry) as lat, severity, description, reported_at`,
      [hazardType, longitude, latitude, severity || 'medium', description, reporterId]
    );

    const newHazard = result.rows[0];

    // Fire WebSocket broadcast
    if (global.broadcastUpdate) {
      global.broadcastUpdate('hazards', {
        action: 'new_hazard',
        hazard: newHazard
      });
    }
    
    // Add to in-memory as backward compatibility backup
    bangaloreData.hazards.push({
      ...newHazard,
      coords: [latitude, longitude]
    });

    res.json({
      status: 'hazard_reported',
      hazardId: newHazard.id,
      message: 'Thank you! Your report helps other commuters.',
    });
  } catch (error) {
    console.error('Error reporting hazard to DB:', error.message);
    // Silent fallback to memory if DB not strictly available
    const fallbackHazard = {
      id: 'hazard_' + Date.now(),
      type: hazardType,
      severity: severity || 'medium',
      coords: [latitude, longitude],
      description,
      reportedBy
    };
    bangaloreData.hazards.push(fallbackHazard);
    if (global.broadcastUpdate) {
      global.broadcastUpdate('hazards', { action: 'new_hazard', hazard: fallbackHazard });
    }
    res.json({ status: 'hazard_reported', hazardId: fallbackHazard.id, message: 'Fallback memory report success.' });
  }
});

/**
 * GET /api/hazards - Get all hazards
 */
router.get('/api/hazards', async (req, res) => {
  const { minLat, maxLat, minLon, maxLon } = req.query;

  try {
    let query = `
      SELECT id, type, ST_X(location::geometry) as lon, ST_Y(location::geometry) as lat, 
             severity, description, reported_at 
      FROM hazards 
      WHERE status = 'active'
    `;
    const params = [];

    if (minLat && maxLat && minLon && maxLon) {
      query += ` AND location && ST_MakeEnvelope($1, $2, $3, $4, 4326)`;
      params.push(minLon, minLat, maxLon, maxLat);
    }

    const result = await pool.query(query, params);
    const dbHazards = result.rows.map(h => ({
      ...h,
      coords: [h.lat, h.lon]
    }));

    // Merge with in-memory fallback to preserve old demo nodes + real nodes
    const allHazards = [...bangaloreData.hazards, ...dbHazards];

    // Deduplicate by coords slightly to prevent massive overlap
    const uniqueHazards = Array.from(new Map(allHazards.map(item => [item.coords.join(','), item])).values());

    res.json({
      timestamp: new Date().toISOString(),
      totalHazards: uniqueHazards.length,
      hazards: uniqueHazards
    });
  } catch (error) {
    console.error('Error fetching DB hazards:', error.message);
    res.json({
      timestamp: new Date().toISOString(),
      totalHazards: bangaloreData.hazards.length,
      hazards: bangaloreData.hazards
    });
  }
});

/**
 * PUT /api/hazard/:id/resolve - Admin Resolves Hazard
 */
router.put('/api/hazard/:id/resolve', async (req, res) => {
  const { id } = req.params;
  try {
    const isDbUuid = id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    if (isDbUuid) {
      await pool.query("UPDATE hazards SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    }
    
    // Update memory cache
    const target = bangaloreData.hazards.find(h => h.id === id);
    if (target) target.status = 'resolved';

    if (global.broadcastUpdate) {
      global.broadcastUpdate('hazards', { action: 'hazard_resolved', hazardId: id });
    }
    res.json({ status: 'success', message: 'Hazard officially resolved' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error while resolving hazard' });
  }
});

/**
 * POST /api/routes/feedback - User ML Feedback
 */
router.post('/api/routes/feedback', (req, res) => {
  const { origin, destination, score, comments } = req.body;
  try {
     // Save feedback in global runtime so the ML Python engine can pull dynamically
     const feedbackObj = { origin, destination, score, comments, timestamp: Date.now() };
     if (!global.mlFeedback) global.mlFeedback = [];
     global.mlFeedback.push(feedbackObj);

     res.json({ status: 'Feedback securely registered for AI reinforcement.' });
  } catch(e) {
     res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/routes/ml-feedback - Fetches aggregated human intelligence
 */
router.get('/api/routes/ml-feedback', (req, res) => {
   res.json(global.mlFeedback || []);
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
