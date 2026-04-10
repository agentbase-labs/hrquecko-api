import express from 'express';
import db from '../models/database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all employees (Admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const employees = await db.all(`
      SELECT 
        id,
        name,
        email,
        department,
        role,
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

// Get dashboard stats (Admin only)
router.get('/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Total employees
    const totalEmployees = await db.get('SELECT COUNT(*) as count FROM users WHERE role = $1', ['employee']);

    // Today's attendance count
    const todayAttendance = await db.get(`
      SELECT COUNT(*) as count FROM attendance WHERE date = $1
    `, [today]);

    // Present today (checked in)
    const presentToday = parseInt(todayAttendance.count);

    // Checked out today
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