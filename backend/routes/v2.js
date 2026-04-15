/**
 * ClearPath Advanced API Routes v2.0
 * Optimized for performance with response caching
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const EnhancedScorer = require('../utils/enhanced_scorer');
const EmergencyHandler = require('../utils/emergency');
const HazardManager = require('../utils/hazard_manager');
const LocationServices = require('../utils/location_services');

// Response Cache with TTL
class CacheManager {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, ttlMs = 30000) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  clear() {
    this.cache.clear();
  }
}

const cacheManager = new CacheManager();

// Middleware for caching 
const cacheResponse = (req, res, next) => {
  const cacheKey = `${req.method}:${req.originalUrl}`;
  const cached = cacheManager.get(cacheKey);
  
  if (cached) {
    return res.json({ ...cached, cached: true });
  }
  
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (res.statusCode === 200) {
      cacheManager.set(cacheKey, data, 30000); // Cache for 30s
    }
    return originalJson(data);
  };
  
  next();
};

// ===== ROUTE MANAGEMENT =====

router.post('/v2/routes/search', cacheResponse, async (req, res) => {
  try {
    const { origin, destination, filters } = req.body || {};
    
    const startLat = origin?.lat || 12.9716;
    const startLon = origin?.lon || 77.6412;
    const endLat = destination?.lat || 12.9352;
    const endLon = destination?.lon || 77.6245;

    // Optimized query with limit
    const routes = await pool.query(
      `SELECT id, name, distance_km, safety_rating
       FROM routes
       ORDER BY distance_km ASC LIMIT 10`
    );

    res.json({
      timestamp: new Date().toISOString(),
      origin: { lat: startLat, lon: startLon },
      destination: { lat: endLat, lon: endLon },
      routes: routes.rows || []
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.post('/v2/score-route', async (req, res) => {
  try {
    const { routes, preferences, userProfile } = req.body;

    if (!routes || routes.length === 0) {
      return res.status(400).json({ error: 'No routes provided' });
    }

    // Get active hazards once
    const hazardsResult = await pool.query(
      `SELECT id, type, severity, 
              ST_X(location::geometry) as lon, 
              ST_Y(location::geometry) as lat
       FROM hazards 
       WHERE status = 'active'
       LIMIT 500`
    );

    const hazards = hazardsResult.rows;
    const scorer = new EnhancedScorer(hazards, userProfile || {});

    // Score routes efficiently
    const scoredRoutes = routes.map(route => ({
      ...route,
      ...scorer.calculateCompositeScore(route)
    })).sort((a, b) => b.composite - a.composite);

    res.json({
      timestamp: new Date().toISOString(),
      scoredRoutes,
      best: scoredRoutes[0] || null,
      alternatives: scoredRoutes.slice(1, 3)
    });
  } catch (error) {
    console.error('Scoring error:', error);
    res.status(500).json({ error: 'Scoring failed' });
  }
});

router.get('/v2/routes/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const route = await pool.query('SELECT * FROM routes WHERE id = $1 LIMIT 1', [id]);
    if (route.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const hazards = await HazardManager.getHazardsByRoute(id);

    res.json({
      route: route.rows[0],
      hazards: hazards || [],
      safetyRating: route.rows[0]?.safety_rating || 75
    });
  } catch (error) {
    console.error('Route detail error:', error);
    res.status(500).json({ error: 'Failed to get route details' });
  }
});

// ===== WOMEN'S SAFETY =====

router.post('/v2/women-safety/share-location', async (req, res) => {
  try {
    const { userId, duration, sharedWith } = req.body;

    const result = await EmergencyHandler.startLocationSharing(userId, duration, sharedWith);

    res.json({
      shareToken: result.sessionId,
      link: result.shareLink,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    console.error('Location sharing error:', error);
    res.status(500).json({ error: 'Location sharing failed' });
  }
});

router.post('/v2/women-safety/emergency', async (req, res) => {
  try {
    const { userId, incidentType, location, description } = req.body;

    const alert = await EmergencyHandler.handleEmergencySOS(
      userId,
      incidentType,
      location,
      description
    );

    res.json(alert);
  } catch (error) {
    console.error('Emergency error:', error);
    res.status(500).json({ error: 'Emergency alert failed' });
  }
});

router.get('/v2/nearest-police/:lat/:lon', cacheResponse, async (req, res) => {
  try {
    const { lat, lon } = req.params;

    const stations = await LocationServices.getNearestPoliceStations(
      { lat: parseFloat(lat), lon: parseFloat(lon) }
    );

    res.json({
      stations: stations || [],
      nearest: stations?.[0] || null,
      distance: stations?.[0]?.distance_km || 0,
      eta: stations?.[0]?.distance_km ? Math.ceil(stations[0].distance_km * 3) : 0
    });
  } catch (error) {
    console.error('Police station error:', error);
    res.status(500).json({ error: 'Failed to find police stations' });
  }
});

router.post('/v2/women-safety/report-incident', async (req, res) => {
  try {
    const { userId, type, location, severity, description } = req.body;

    const result = await HazardManager.reportHazard(userId, type, location, severity, description);

    res.json({
      incidentId: result.hazardId,
      sentToAuthorities: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Incident report error:', error);
    res.status(500).json({ error: 'Failed to report incident' });
  }
});

// ===== HAZARDS =====

router.get('/v2/hazards/:routeId', cacheResponse, async (req, res) => {
  try {
    const { routeId } = req.params;

    const hazards = await HazardManager.getHazardsByRoute(routeId);

    res.json({
      routeId,
      hazards: hazards || [],
      totalHazards: hazards?.length || 0,
      activeHazards: hazards?.filter(h => h.status === 'active')?.length || 0
    });
  } catch (error) {
    console.error('Hazard retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve hazards' });
  }
});

router.post('/v2/hazard/report', async (req, res) => {
  try {
    const { userId, type, location, severity, description } = req.body;

    const result = await HazardManager.reportHazard(userId, type, location, severity, description);

    // Invalidate cache
    cacheManager.clear();

    res.json({
      hazardId: result.hazardId,
      isDuplicate: result.isDuplicate || false,
      message: result.message
    });
  } catch (error) {
    console.error('Hazard report error:', error);
    res.status(500).json({ error: 'Failed to report hazard' });
  }
});

router.patch('/v2/hazard/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;

    const result = await HazardManager.resolveHazard(id, resolution_notes || '');
    cacheManager.clear();

    res.json({
      updated: !!result,
      hazard: result || null
    });
  } catch (error) {
    console.error('Hazard update error:', error);
    res.status(500).json({ error: 'Failed to update hazard' });
  }
});

// ===== HOSPITALS & MEDICAL =====

router.get('/v2/hospitals/nearest', cacheResponse, async (req, res) => {
  try {
    const { lat, lon, specialization } = req.query;

    const hospitals = await LocationServices.getNearestHospitals(
      { lat: parseFloat(lat), lon: parseFloat(lon) },
      specialization
    );

    res.json({
      hospitals: hospitals || [],
      count: hospitals?.length || 0
    });
  } catch (error) {
    console.error('Hospital search error:', error);
    res.status(500).json({ error: 'Failed to find hospitals' });
  }
});

router.get('/v2/ambulance-status', cacheResponse, async (req, res) => {
  try {
    const { lat, lon } = req.query;

    const ambulances = await LocationServices.getNearestAmbulances({
      lat: parseFloat(lat),
      lon: parseFloat(lon)
    });

    res.json({
      available: ambulances?.length > 0,
      nearest: ambulances?.[0] || null,
      count: ambulances?.length || 0,
      ambulances: ambulances || []
    });
  } catch (error) {
    console.error('Ambulance status error:', error);
    res.status(500).json({ error: 'Failed to get ambulance status' });
  }
});

// ===== CONTROL UNIT (Admin) =====

router.get('/v2/control/dashboard', cacheResponse, async (req, res) => {
  try {
    const [alerts, alertStats, hazardStats, activeHazards] = await Promise.all([
      EmergencyHandler.getEmergencyAlerts(20),
      EmergencyHandler.getAlertStats(),
      HazardManager.getHazardStats(),
      HazardManager.getActiveHazards(50)
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      emergencyAlerts: alerts || [],
      alertStats: alertStats || {},
      hazardStats: hazardStats || [],
      activeHazards: activeHazards || [],
      summary: {
        totalAlerts: alertStats?.total || 0,
        pendingAlerts: alertStats?.pending || 0,
        activeHazards: activeHazards?.length || 0
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.patch('/v2/control/hazard/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;

    const result = await HazardManager.resolveHazard(id, resolution_notes);
    cacheManager.clear();

    res.json({
      updated: !!result,
      hazard: result || null
    });
  } catch (error) {
    console.error('Hazard update error:', error);
    res.status(500).json({ error: 'Failed to update hazard' });
  }
});

// ===== USER MANAGEMENT =====

router.post('/v2/users/register', async (req, res) => {
  try {
    const { name, phone, email, gender, vehicleType } = req.body;
    const userId = uuidv4();

    const result = await pool.query(
      `INSERT INTO users (id, name, phone, email, gender, vehicle_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, name, email`,
      [userId, name, phone, email, gender, vehicleType]
    );

    res.json({
      userId: result.rows[0].id,
      created: true
    });
  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/v2/users/:id/trusted-contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { contacts } = req.body;

    const result = await pool.query(
      `UPDATE users SET trusted_contacts = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [JSON.stringify(contacts), id]
    );

    res.json({
      updated: result.rows.length > 0
    });
  } catch (error) {
    console.error('Update trusted contacts error:', error);
    res.status(500).json({ error: 'Failed to update contacts' });
  }
});

// ===== STATISTICS =====

router.get('/v2/stats/incidents', cacheResponse, async (req, res) => {
  try {
    const [stats, hazardStats] = await Promise.all([
      EmergencyHandler.getAlertStats(),
      HazardManager.getHazardStats()
    ]);

    res.json({
      emergencyAlerts: stats || {},
      hazardReports: hazardStats || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
