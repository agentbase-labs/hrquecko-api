import express from 'express';
import db from '../models/database.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/employees — Get all employees (Admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const employees = await db.all(`
      SELECT 
        id,
        name,
        email,
        department,
        position,
        role,
        phone,
        created_at
      FROM users
      ORDER BY created_at DESC
    `, []);

    res.json({ employees });
  } catch (error) {
    console.error('Employees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/employees — Create new employee (Admin only)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, email, password, department, position, role, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    // Check if email already exists
    const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(`
      INSERT INTO users (name, email, password, department, position, role, phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, email, department, position, role, phone, created_at
    `, [name, email, hashedPassword, department || null, position || null, role || 'employee', phone || null]);

    res.json({ message: 'Employee created successfully', employee: result.rows[0] });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/employees/stats — Dashboard stats (Admin only)
router.get('/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalEmployees = await db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'employee'`);
    const todayAttendance = await db.get(`SELECT COUNT(*) as count FROM attendance WHERE date = $1`, [today]);
    const presentToday = parseInt(todayAttendance.count);
    const checkedOut = await db.get(`
      SELECT COUNT(*) as count FROM attendance 
      WHERE date = $1 AND check_out IS NOT NULL
    `, [today]);

    res.json({
      stats: {
        totalEmployees: parseInt(totalEmployees.count),
        presentToday: presentToday,
        checkedOut: parseInt(checkedOut.count),
        absent: parseInt(totalEmployees.count) - presentToday
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
