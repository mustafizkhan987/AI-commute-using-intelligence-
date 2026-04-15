/**
 * Hazard Management System
 * Handles reporting, validation, and aggregation of street hazards
 */

const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

class HazardManager {
  // Cache for recently checked duplicates (TTL: 5 minutes)
  static duplicateCache = new Map();

  static async reportHazard(userId, type, location, severity, description) {
    try {
      const hazardId = uuidv4();
      const point = `POINT(${location.lon} ${location.lat})`;

      // Check for duplicate hazards nearby (with cache optimization)
      const cacheKey = `${type}|${location.lat}|${location.lon}`;
      let duplicateHazard = null;

      // Check cache first
      if (this.duplicateCache.has(cacheKey)) {
        duplicateHazard = this.duplicateCache.get(cacheKey);
      } else {
        // Query database
        const duplicateCheck = await pool.query(
          `SELECT id, reported_at FROM hazards
           WHERE type = $1 AND severity = $2 AND status = 'active'
           AND ST_DWithin(location::geography, $3::geography, 100)
           ORDER BY reported_at DESC LIMIT 1`,
          [type, severity, `SRID=4326;${point}`]
        );

        if (duplicateCheck.rows.length > 0) {
          duplicateHazard = duplicateCheck.rows[0];
          this.duplicateCache.set(cacheKey, duplicateHazard);
          // Clear cache after 5 minutes
          setTimeout(() => this.duplicateCache.delete(cacheKey), 300000);
        }
      }

      if (duplicateHazard) {
        // Increment duration for existing hazard
        await pool.query(
          `UPDATE hazards SET duration_minutes = duration_minutes + 5, upvotes = upvotes + 1
           WHERE id = $1`,
          [duplicateHazard.id]
        );
        return { hazardId: duplicateHazard.id, isDuplicate: true };
      }

      // Create new hazard (optimized query)
      const result = await pool.query(
        `INSERT INTO hazards 
         (id, type, location, severity, description, reported_by, reported_at, status, duration_minutes)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, NOW(), 'active', 30)
         RETURNING id, type, severity`,
        [hazardId, type, location.lon, location.lat, severity, description, userId]
      );

      // Find affected routes asynchronously (non-blocking)
      this.findAffectedRoutes(location).then(affectedRoutes => {
        if (affectedRoutes.length > 0) {
          pool.query(
            `UPDATE hazards SET affected_routes = $1 WHERE id = $2 AND affected_routes IS NULL`,
            [JSON.stringify(affectedRoutes), hazardId]
          ).catch(err => console.error('Error updating affected routes:', err));
        }
      });

      return {
        hazardId,
        type,
        severity,
        location,
        message: `✅ ${severity} ${type} reported`
      };
    } catch (error) {
      console.error('Error reporting hazard:', error);
      throw error;
    }
  }

  static async findAffectedRoutes(location, radiusKm = 2) {
    try {
      const result = await pool.query(
        `SELECT id FROM routes
         WHERE ST_DWithin(start_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)
         OR ST_DWithin(end_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)
         LIMIT 20`,
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
          id, type, severity, description, reported_by, reported_at, status, upvotes, downvotes,
          ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
         FROM hazards
         WHERE status = 'active'
         AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)
         ORDER BY distance_km ASC
         LIMIT 50`,
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
         SET status = 'resolved', resolved_at = NOW(), resolution_notes = $1
         WHERE id = $2
         RETURNING id, type, severity`,
        [notes || '', hazardId]
      );

      if (result.rows.length > 0) {
        console.log(`✓ Hazard ${hazardId} resolved`);
      }
      return result.rows[0] || null;
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
          sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::int as active,
          sum(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END)::int as resolved
        FROM hazards
        WHERE reported_at > NOW() - INTERVAL '7 days'
        GROUP BY type, severity
        ORDER BY count DESC
        LIMIT 20
      `);
      return result.rows;
    } catch (error) {
      console.error('Error fetching hazard stats:', error);
      return [];
    }
  }

  static async getActiveHazards(limit = 50) {
    try {
      const result = await pool.query(`
        SELECT 
          id, type, severity, description, 
          ST_X(location::geometry) as lon,
          ST_Y(location::geometry) as lat,
          reported_at, affected_routes, upvotes, downvotes
        FROM hazards
        WHERE status = 'active'
        ORDER BY reported_at DESC LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching active hazards:', error);
      return [];
    }
  }
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
