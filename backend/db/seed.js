const pool = require('../db');

const seedDatabase = async () => {
  try {
    console.log('🌱 Seeding database with Bangalore data...');

    // Seed Police Stations
    await pool.query(`
      INSERT INTO police_stations (name, location, phone, womens_helpline, response_time_minutes, coverage_radius_km)
      VALUES 
        ('Koramangala Police Station', ST_SetSRID(ST_MakePoint(77.6263, 12.9352), 4326), '080-26444040', '1091', 10, 3.5),
        ('Indiranagar Police Station', ST_SetSRID(ST_MakePoint(77.6389, 13.0016), 4326), '080-25537007', '1091', 12, 3.5),
        ('Madiwala Police Station', ST_SetSRID(ST_MakePoint(77.6063, 12.8944), 4326), '080-26532155', '1091', 15, 4.0),
        ('Whitefield Police Station', ST_SetSRID(ST_MakePoint(77.7456, 12.9698), 4326), '080-26151040', '1091', 18, 5.0),
        ('Jaya Nagar Police Station', ST_SetSRID(ST_MakePoint(77.5981, 12.9351), 4326), '080-26533166', '1091', 12, 3.5),
        ('Jayanagar Traffic Police', ST_SetSRID(ST_MakePoint(77.6015, 12.9420), 4326), '080-26533500', '1091', 8, 2.5)
      ON CONFLICT DO NOTHING;
    `);

    // Seed Hospitals
    await pool.query(`
      INSERT INTO hospitals (name, location, phone, emergency_phone, specialties, wait_time_minutes, beds_available, rating)
      VALUES 
        ('Apollo Hospital Bangalore', ST_SetSRID(ST_MakePoint(77.6124, 12.9352), 4326), '080-28182727', '+91-98450-11911', ARRAY['Emergency', 'Women''s Care', 'Trauma', 'ICU'], 25, 45, 4.8),
        ('Fortis Hospital Bangalore', ST_SetSRID(ST_MakePoint(77.6047, 12.9725), 4326), '080-40259000', '+91-98203-45999', ARRAY['Emergency', 'Trauma', 'Women''s Health', 'ICU'], 30, 38, 4.7),
        ('St. Martha''s Hospital', ST_SetSRID(ST_MakePoint(77.5963, 12.9351), 4326), '080-26562633', '+91-98805-22222', ARRAY['Emergency', 'Women''s Safety', 'ICU'], 20, 25, 4.6),
        ('Manipal Hospital Bangalore', ST_SetSRID(ST_MakePoint(77.6401, 12.9754), 4326), '080-66928888', '+91-97414-00999', ARRAY['Emergency', 'Women''s Care', 'Trauma'], 35, 50, 4.7),
        ('Max Healthcare Bangalore', ST_SetSRID(ST_MakePoint(77.6145, 12.9789), 4326), '080-22225555', '+91-98460-00222', ARRAY['Emergency', 'Women''s Health', 'Trauma', 'ICU'], 28, 42, 4.5)
      ON CONFLICT DO NOTHING;
    `);

    // Seed Routes
    await pool.query(`
      INSERT INTO routes (name, start_point, end_point, distance_km, safety_rating)
      VALUES 
        ('MG Road - IT Park', ST_SetSRID(ST_MakePoint(77.6012, 12.9352), 4326), ST_SetSRID(ST_MakePoint(77.6900, 12.9719), 4326), 12.5, 78),
        ('Koramangala - Whitefield', ST_SetSRID(ST_MakePoint(77.6263, 12.9352), 4326), ST_SetSRID(ST_MakePoint(77.7456, 12.9698), 4326), 18.3, 72),
        ('Indiranagar - Airport Road', ST_SetSRID(ST_MakePoint(77.6389, 13.0016), 4326), ST_SetSRID(ST_MakePoint(77.7265, 13.1959), 4326), 20.5, 65),
        ('Jayanagar - HSR', ST_SetSRID(ST_MakePoint(77.5981, 12.9351), 4326), ST_SetSRID(ST_MakePoint(77.6260, 12.9728), 4326), 8.7, 81),
        ('BTM - Madiwala', ST_SetSRID(ST_MakePoint(77.6047, 12.9725), 4326), ST_SetSRID(ST_MakePoint(77.6063, 12.8944), 4326), 11.2, 75),
        ('Electronic City Loop', ST_SetSRID(ST_MakePoint(77.6780, 12.8387), 4326), ST_SetSRID(ST_MakePoint(77.6950, 12.8453), 4326), 5.8, 68)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✓ Database seeded successfully');
  } catch (error) {
    console.error('✗ Error seeding database:', error);
    throw error;
  }
};

module.exports = seedDatabase;
