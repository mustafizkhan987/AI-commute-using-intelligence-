/**
 * Emergency Response Handler
 * Handles SOS triggers, police notifications, ambulance dispatch, etc.
 */

const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

class EmergencyHandler {
  static async handleEmergencySOS(userId, incidentType, location, description) {
    try {
      const alertId = uuidv4();
      
      // Create emergency alert
      const alert = await pool.query(
        `INSERT INTO emergency_alerts 
        (id, user_id, incident_type, location, severity, description, status, created_at)
        VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8, NOW())
        RETURNING *`,
        [alertId, userId, incidentType, location.lon, location.lat, 'critical', description, 'pending']
      );

      // Notify police
      const policeNotified = await this.notifyNearestPolice(location, alertId);

      // Notify hospital if medical emergency
      if (incidentType === 'medical') {
        await this.notifyNearestHospital(location, alertId);
      }

      // Notify trusted contacts via SMS
      const user = await pool.query('SELECT trusted_contacts FROM users WHERE id = $1', [userId]);
      if (user.rows[0]?.trusted_contacts) {
        await this.notifyTrustedContacts(user.rows[0].trusted_contacts, location, alertId);
      }

      return {
        success: true,
        alertId,
        policeNotified,
        message: 'Emergency alert sent. Help is on the way.'
      };
    } catch (error) {
      console.error('Emergency SOS error:', error);
      throw error;
    }
  }

  static async notifyNearestPolice(location, alertId) {
    try {
      const result = await pool.query(
        `SELECT id, name, phone, location, 
        ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance
        FROM police_stations
        ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT 3`,
        [location.lon, location.lat]
      );

      const policeStations = result.rows;
      
      // Update alert with nearest police
      if (policeStations.length > 0) {
        await pool.query(
          'UPDATE emergency_alerts SET nearest_police = $1, notified_at = NOW() WHERE id = $2',
          [policeStations[0].id, alertId]
        );

        // Simulate SMS/Call notification
        console.log(`📞 Police notification sent to ${policeStations[0].name}`);
      }

      return policeStations;
    } catch (error) {
      console.error('Error notifying police:', error);
      return [];
    }
  }

  static async notifyNearestHospital(location, alertId) {
    try {
      const result = await pool.query(
        `SELECT id, name, emergency_phone,
        ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance
        FROM hospitals
        ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT 1`,
        [location.lon, location.lat]
      );

      if (result.rows.length > 0) {
        const hospital = result.rows[0];
        await pool.query(
          'UPDATE emergency_alerts SET nearest_hospital = $1 WHERE id = $2',
          [hospital.id, alertId]
        );
        console.log(`🏥 Hospital notification sent to ${hospital.name}`);
      }

      return result.rows;
    } catch (error) {
      console.error('Error notifying hospital:', error);
      return [];
    }
  }

  static async notifyTrustedContacts(contacts, location, alertId) {
    try {
      const shareLink = `https://clearpath.app/emergency/${alertId}/live`;
      contacts.forEach(contact => {
        if (contact.phone) {
          // Simulate SMS
          console.log(`📱 SMS sent to ${contact.name} (${contact.phone}): Emergency alert at ${location.lat}, ${location.lon}. View: ${shareLink}`);
        }
      });
    } catch (error) {
      console.error('Error notifying contacts:', error);
    }
  }

  static async resolveEmergency(alertId, notes) {
    try {
      const result = await pool.query(
        `UPDATE emergency_alerts 
        SET status = 'resolved', resolved_at = NOW()
        WHERE id = $1
        RETURNING *`,
        [alertId]
      );
      
      console.log(`✓ Emergency ${alertId} marked as resolved`);
      return result.rows[0];
    } catch (error) {
      console.error('Error resolving emergency:', error);
      throw error;
    }
  }

  static async startLocationSharing(userId, duration, sharedWith) {
    try {
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + duration * 60000);

      const result = await pool.query(
        `INSERT INTO safety_sessions 
        (id, user_id, shared_with, started_at, expires_at, is_active)
        VALUES ($1, $2, $3, NOW(), $4, true)
        RETURNING *`,
        [sessionId, userId, JSON.stringify(sharedWith), expiresAt]
      );

      return {
        sessionId,
        shareLink: `https://clearpath.app/location/${sessionId}`,
        expiresAt
      };
    } catch (error) {
      console.error('Error starting location sharing:', error);
      throw error;
    }
  }

  static async getEmergencyAlerts(limit = 10) {
    try {
      const result = await pool.query(
        `SELECT a.*, 
        u.name as user_name, u.phone,
        p.name as police_name, p.phone as police_phone,
        h.name as hospital_name
        FROM emergency_alerts a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN police_stations p ON a.nearest_police = p.id
        LEFT JOIN hospitals h ON a.nearest_hospital = h.id
        WHERE a.status IN ('pending', 'notified')
        ORDER BY a.created_at DESC
        LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching alerts:', error);
      return [];
    }
  }

  static async getAlertStats() {
    try {
      const result = await pool.query(
        `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'notified' THEN 1 ELSE 0 END) as notified,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
        FROM emergency_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours'`
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching alert stats:', error);
      return { total: 0, pending: 0, notified: 0, resolved: 0 };
    }
  }
}

module.exports = EmergencyHandler;
