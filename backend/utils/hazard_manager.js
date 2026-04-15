/**
 * Hazard Management System
 * Handles reporting, validation, and aggregation of street hazards
 */

const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

class HazardManager {
  static async reportHazard(userId, type, location, severity, description) {
    try {
      const hazardId = uuidv4();

      // Check for duplicate hazards nearby
      const duplicateCheck = await pool.query(
        `SELECT id FROM hazards
        WHERE type = $1 AND severity = $2 AND status = 'active'
        AND ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography) < 100
        LIMIT 1`,
        [type, severity, location.lon, location.lat]
      );

      if (duplicateCheck.rows.length > 0) {
        // Update existing hazard
        await pool.query(
          `UPDATE hazards SET duration_minutes = duration_minutes + 5 
          WHERE id = $1`,
          [duplicateCheck.rows[0].id]
        );
        return { hazardId: duplicateCheck.rows[0].id, isDuplicate: true };
      }

      // Create new hazard
      const result = await pool. query(
        `INSERT INTO hazards 
        (id, type, location, severity, description, reported_by, reported_at, status)
        VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, NOW(), 'active')
        RETURNING *`,
        [hazardId, type, location.lon, location.lat, severity, description, userId]
      );

      // Find affected routes
      const affectedRoutes = await this.findAffectedRoutes(location);
      if (affectedRoutes.length > 0) {
        await pool.query(
          `UPDATE hazards SET affected_routes = $1 WHERE id = $2`,
          [JSON.stringify(affectedRoutes), hazardId]
        );
      }

      return {
        hazardId,
        type,
        severity,
        location,
        affectedRoutes,
        message: `Hazard reported: ${severity} ${type}`
      };
    } catch (error) {
      console.error('Error reporting hazard:', error);
      throw error;
    }
  }

  static async findAffectedRoutes(location, radiusKm = 2) {
    try {
      const result = await pool.query(
        `SELECT id, name FROM routes
        WHERE ST_Distance(start_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < $3 * 1000
        OR ST_Distance(end_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < $3 * 1000`,
        [location.lon, location.lat, radiusKm]
      );
      return result.rows.map(r => r.id);
    } catch (error) {
      console.error('Error finding affected routes:', error);
      return [];
    }
  }

  static async getHazardsNear(location, radiusKm = 5) {
    try {
      const result = await pool.query(
        `SELECT 
        id, type, severity, description, reported_by, reported_at, status,
        ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
        FROM hazards
        WHERE status = 'active'
        AND ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) < $3 * 1000
        ORDER BY distance_km ASC`,
        [location.lon, location.lat, radiusKm]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching nearby hazards:', error);
      return [];
    }
  }

  static async resolveHazard(hazardId, notes) {
    try {
      const result = await pool.query(
        `UPDATE hazards 
        SET status = 'resolved', resolved_at = NOW()
        WHERE id = $1
        RETURNING *`,
        [hazardId]
      );

      console.log(`✓ Hazard ${hazardId} resolved`);
      return result.rows[0];
    } catch (error) {
      console.error('Error resolving hazard:', error);
      throw error;
    }
  }

  static async getHazardStats() {
    try {
      const result = await pool.query(`
        SELECT 
          type,
          severity,
          COUNT(*) as count,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved
        FROM hazards
        WHERE reported_at > NOW() - INTERVAL '7 days'
        GROUP BY type, severity
        ORDER BY count DESC
      `);
      return result.rows;
    } catch (error) {
      console.error('Error fetching hazard stats:', error);
      return [];
    }
  }

  static async getActivHazards() {
    try {
      const result = await pool.query(`
        SELECT 
          id, type, severity, description, 
          ST_X(location::geometry) as lat,
          ST_Y(location::geometry) as lon,
          reported_at, affected_routes
        FROM hazards
        WHERE status = 'active'
        ORDER BY reported_at DESC
        LIMIT 50
      `);
      return result.rows;
    } catch (error) {
      console.error('Error fetching active hazards:', error);
      return [];
    }
  }

  static async getHazardsByRoute(routeId) {
    try {
      const result = await pool.query(
        `SELECT * FROM hazards
        WHERE $1 = ANY(affected_routes) AND status = 'active'`,
        [routeId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching hazards for route:', error);
      return [];
    }
  }

  static async upvoteHazard(hazardId, userId) {
    try {
      const result = await pool.query(
        `INSERT INTO hazard_reports (hazard_id, user_id, severity_vote)
        VALUES ($1, $2, 1)
        ON CONFLICT DO NOTHING
        RETURNING *`,
        [hazardId, userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error upvoting hazard:', error);
      return null;
    }
  }

  static async downvoteHazard(hazardId) {
    try {
      // If hazard gets too many down votes, automatically resolve it
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM hazard_reports
        WHERE hazard_id = $1 AND severity_vote < 0`,
        [hazardId]
      );

      if (result.rows[0].count > 10) {
        await this.resolveHazard(hazardId, 'Crowd-sourced validation - no longer valid');
      }
    } catch (error) {
      console.error('Error downvoting hazard:', error);
    }
  }
}

module.exports = HazardManager;
