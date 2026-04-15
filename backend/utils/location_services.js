/**
 * Location Services - Spatial queries for nearby facilities
 */

const pool = require('../db');

class LocationServices {
  static async getNearestPoliceStations(location, limit = 5) {
    try {
      const result = await pool.query(
        `SELECT 
        id, name, phone, womens_helpline, response_time_minutes,
        ST_X(location::geometry) as lat,
        ST_Y(location::geometry) as lon,
        ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
        FROM police_stations
        ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT $3`,
        [location.lon, location.lat, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching police stations:', error);
      return [];
    }
  }

  static async getNearestHospitals(location, specialization = null, limit = 5) {
    try {
      let query = `
        SELECT 
        id, name, phone, emergency_phone, specialties, wait_time_minutes, beds_available, rating,
        ST_X(location::geometry) as lat,
        ST_Y(location::geometry) as lon,
        ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
        FROM hospitals
      `;
      
      const params = [location.lon, location.lat];
      
      if (specialization) {
        query += ` WHERE $3 = ANY(specialties)`;
        params.push(specialization);
      }
      
      query += ` ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326) LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      return [];
    }
  }

  static async getNearestAmbulances(location, limit = 3) {
    try {
      // Simulated ambulance service - in real app, would connect to ambulance service DB
      const hospitals = await this.getNearestHospitals(location, null, 3);
      return hospitals.map(h => ({
        serviceId: `AMBULANCE_${h.id}`,
        hospital: h.name,
        phone: h.emergency_phone,
        lat: h.lat,
        lon: h.lon,
        eta_minutes: Math.ceil(h.distance_km * 2) // Rough estimate
      }));
    } catch (error) {
      console.error('Error fetching ambulances:', error);
      return [];
    }
  }

  static async searchFacilities(location, facilityType, radiusKm = 10) {
    try {
      let table = '';
      let fields = '';

      if (facilityType === 'police') {
        table = 'police_stations';
        fields = `id, name, phone, womens_helpline as secondary_info`;
      } else if (facilityType === 'hospital') {
        table = 'hospitals';
        fields = `id, name, phone as contact, specialties as details`;
      }

      if (!table) return [];

      const result = await pool.query(
        `SELECT ${fields},
        ST_X(location::geometry) as lat,
        ST_Y(location::geometry) as lon,
        ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
        FROM ${table}
        WHERE ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < $3 * 1000
        ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)`,
        [location.lon, location.lat, radiusKm]
      );

      return result.rows;
    } catch (error) {
      console.error('Error searching facilities:', error);
      return [];
    }
  }

  static async getRouteBoundaryMarkers(startLat, startLon, endLat, endLon) {
    try {
      const policeStations = await pool.query(
        `SELECT id, name, location, phone
        FROM police_stations
        WHERE ST_DWithin(
          location::geography,
          ST_GeomFromText('LINESTRING($1 $2, $3 $4)', 4326)::geography,
          5000
        )`,
        [startLon, startLat, endLon, endLat]
      );

      const hospitals = await pool.query(
        `SELECT id, name, location, emergency_phone
        FROM hospitals
        WHERE ST_DWithin(
          location::geography,
          ST_GeomFromText('LINESTRING($1 $2, $3 $4)', 4326)::geography,
          5000
        )`,
        [startLon, startLat, endLon, endLat]
      );

      return {
        policeStations: policeStations.rows,
        hospitals: hospitals.rows
      };
    } catch (error) {
      console.error('Error getting route markers:', error);
      return { policeStations: [], hospitals: [] };
    }
  }

  static async calculateUserDensity(location, radiusKm = 1) {
    try {
      // In a real app, this would track active users
      // For now, return simulated data
      const result = await pool.query(
        `SELECT COUNT(*) as nearby_users
        FROM safety_sessions
        WHERE is_active = true
        AND ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < $3 * 1000`,
        [location.lon, location.lat, radiusKm]
      );

      return result.rows[0].nearby_users;
    } catch (error) {
      console.error('Error calculating user density:', error);
      return 0;
    }
  }

  static async getRecommendedPath(startLat, startLon, endLat, endLon) {
    try {
      // Get all available routes
      const routes = await pool.query(
        `SELECT * FROM routes
        WHERE (ST_Distance(start_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < 5000
        OR ST_Distance(end_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < 5000)`
      );

      return routes.rows;
    } catch (error) {
      console.error('Error getting recommended path:', error);
      return [];
    }
  }

  static async getAreaCrimeStats(location, radiusKm = 2) {
    try {
      // Simulated crime stats - would connect to real crime database
      const result = await pool.query(
        `SELECT COUNT(*) as total_incidents
        FROM emergency_alerts
        WHERE status = 'resolved'
        AND ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < $3 * 1000
        AND created_at > NOW() - INTERVAL '30 days'`,
        [location.lon, location.lat, radiusKm]
      );

      return {
        incidents: result.rows[0].total_incidents,
        safetyRating: Math.max(0, 100 - (result.rows[0].total_incidents * 3))
      };
    } catch (error) {
      console.error('Error getting area crime stats:', error);
      return { incidents: 0, safetyRating: 75 };
    }
  }
}

module.exports = LocationServices;
