const pool = require('../db');

const initializeDatabase = async () => {
  try {
    console.log('🔧 Initializing database schema...');

    // Create extensions
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "postgis"');

    // ===== ROUTES TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        start_point GEOMETRY(POINT, 4326),
        end_point GEOMETRY(POINT, 4326),
        distance_km FLOAT,
        historical_data JSONB DEFAULT '{}',
        safety_rating FLOAT DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_routes_start ON routes USING GIST(start_point);
      CREATE INDEX IF NOT EXISTS idx_routes_end ON routes USING GIST(end_point);
    `);

    // ===== HAZARDS TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hazards (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type VARCHAR(50) NOT NULL,
        location GEOMETRY(POINT, 4326),
        severity VARCHAR(20) DEFAULT 'low',
        description TEXT,
        reported_by UUID,
        reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        duration_minutes INT,
        affected_routes UUID[],
        status VARCHAR(20) DEFAULT 'active',
        resolved_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_hazards_location ON hazards USING GIST(location);
      CREATE INDEX IF NOT EXISTS idx_hazards_type ON hazards(type);
      CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards(status);
    `);

    // ===== POLICE STATIONS TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS police_stations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        location GEOMETRY(POINT, 4326),
        phone VARCHAR(20),
        womens_helpline VARCHAR(20),
        response_time_minutes INT DEFAULT 15,
        coverage_radius_km FLOAT DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_police_location ON police_stations USING GIST(location);
    `);

    // ===== HOSPITALS TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        location GEOMETRY(POINT, 4326),
        phone VARCHAR(20),
        emergency_phone VARCHAR(20),
        specialties TEXT[],
        wait_time_minutes INT DEFAULT 30,
        beds_available INT,
        rating FLOAT DEFAULT 4.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_hospitals_location ON hospitals USING GIST(location);
      CREATE INDEX IF NOT EXISTS idx_hospitals_specialties ON hospitals USING GIN(specialties);
    `);

    // ===== USERS TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255),
        phone VARCHAR(20) UNIQUE,
        email VARCHAR(255) UNIQUE,
        gender VARCHAR(20),
        vehicle_type VARCHAR(50),
        safety_mode_enabled BOOLEAN DEFAULT false,
        trusted_contacts JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // ===== WOMEN SAFETY SESSIONS TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS safety_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        location GEOMETRY(POINT, 4326),
        shared_with UUID[],
        shared_with_numbers TEXT[],
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        emergency_triggered_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_safety_sessions_user ON safety_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_safety_sessions_active ON safety_sessions(is_active);
    `);

    // ===== EMERGENCY ALERTS TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        incident_type VARCHAR(50) NOT NULL,
        location GEOMETRY(POINT, 4326),
        severity VARCHAR(20) DEFAULT 'medium',
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        nearest_police UUID REFERENCES police_stations(id),
        nearest_hospital UUID REFERENCES hospitals(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notified_at TIMESTAMP,
        resolved_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_emergency_user ON emergency_alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_emergency_status ON emergency_alerts(status);
      CREATE INDEX IF NOT EXISTS idx_emergency_created ON emergency_alerts(created_at);
    `);

    // ===== HAZARD REPORTS (for crowd-sourcing) =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hazard_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hazard_id UUID REFERENCES hazards(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        severity_vote INT DEFAULT 1,
        helpful_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_hazard_reports_hazard ON hazard_reports(hazard_id);
      CREATE INDEX IF NOT EXISTS idx_hazard_reports_user ON hazard_reports(user_id);
    `);

    // ===== CONTROL UNIT SESSIONS TABLE =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS control_unit_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        officer_id UUID REFERENCES users(id),
        is_active BOOLEAN DEFAULT true,
        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        logout_time TIMESTAMP,
        assigned_area GEOMETRY(POLYGON, 4326),
        active_incidents UUID[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_control_active ON control_unit_sessions(is_active);
    `);

    console.log('✓ Database schema initialized successfully');
  } catch (error) {
    console.error('✗ Error initializing database:', error);
    throw error;
  }
};

module.exports = initializeDatabase;
