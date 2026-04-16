import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';

// PostgreSQL connection pool with SSL support for Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables
const createTables = async () => {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        department TEXT,
        position TEXT,
        phone TEXT,
        role TEXT DEFAULT 'employee',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add position and phone columns if they don't exist (for existing DBs)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT;
    `).catch(() => {});
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    `).catch(() => {});

    // Attendance table
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        check_in TIMESTAMP NOT NULL,
        check_out TIMESTAMP,
        date DATE NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    console.log('✓ Database tables created');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Create default admin account if it doesn't exist
const createAdminAccount = async () => {
  const adminEmail = 'admin@company.com';
  const adminPassword = 'admin123';

  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);

    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await client.query(`
        INSERT INTO users (name, email, password, department, role)
        VALUES ($1, $2, $3, $4, $5)
      `, ['Admin User', adminEmail, hashedPassword, 'Administration', 'admin']);
      console.log('✓ Admin account created (admin@company.com / admin123)');
    }
  } catch (error) {
    console.error('Error creating admin account:', error);
  } finally {
    client.release();
  }
};

// Initialize database
(async () => {
  try {
    await createTables();
    await createAdminAccount();
  } catch (error) {
    console.error('Database initialization error:', error);
  }
})();

// Helper functions for prepared statements
export const db = {
  query: (text, params) => pool.query(text, params),
  
  get: async (text, params) => {
    const result = await pool.query(text, params);
    return result.rows[0];
  },
  
  all: async (text, params) => {
    const result = await pool.query(text, params);
    return result.rows;
  },
  
  run: async (text, params) => {
    const result = await pool.query(text, params);
    return result;
  }
};

export default db;
