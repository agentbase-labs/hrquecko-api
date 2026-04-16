import express from 'express';
import db from '../models/database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Check-in
router.post('/checkin', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if already checked in today
    const existingRecord = await db.get(`
      SELECT * FROM attendance 
      WHERE user_id = $1 AND date = $2
    `, [userId, today]);

    if (existingRecord) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    // Insert check-in record
    const result = await db.query(`
      INSERT INTO attendance (user_id, check_in, date)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [userId, now.toISOString(), today]);

    res.json({
      message: 'Checked in successfully',
      attendance: {
        id: result.rows[0].id,
        check_in: now.toISOString(),
        date: today
      }
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check-out
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Find today's attendance record
    const record = await db.get(`
      SELECT * FROM attendance 
      WHERE user_id = $1 AND date = $2
    `, [userId, today]);

    if (!record) {
      return res.status(400).json({ error: 'No check-in record found for today' });
    }

    if (record.check_out) {
      return res.status(400).json({ error: 'Already checked out today' });
    }

    // Update with check-out time
    await db.run(`
      UPDATE attendance 
      SET check_out = $1
      WHERE id = $2
    `, [now.toISOString(), record.id]);

    res.json({
      message: 'Checked out successfully',
      attendance: {
        id: record.id,
        check_in: record.check_in,
        check_out: now.toISOString(),
        date: today
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get my attendance history
router.get('/my-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const records = await db.all(`
      SELECT 
        id,
        check_in,
        check_out,
        date
      FROM attendance 
      WHERE user_id = $1
      ORDER BY date DESC
      LIMIT 100
    `, [userId]);

    res.json({ records });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get today's status
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const record = await db.get(`
      SELECT * FROM attendance 
      WHERE user_id = $1 AND date = $2
    `, [userId, today]);

    res.json({ 
      today: record || null,
      hasCheckedIn: !!record,
      hasCheckedOut: record?.check_out ? true : false
    });
  } catch (error) {
    console.error('Today status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all attendance records (Admin only)
router.get('/all', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { employee, date } = req.query;

    let query = `
      SELECT 
        a.id,
        a.check_in,
        a.check_out,
        a.date,
        u.id as user_id,
        u.name,
        u.email,
        u.department
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (employee) {
      query += ` AND u.id = $${paramIndex}`;
      params.push(employee);
      paramIndex++;
    }

    if (date) {
      query += ` AND a.date = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    query += ' ORDER BY a.date DESC, a.check_in DESC LIMIT 500';

    const records = await db.all(query, params);

    res.json({ records });
  } catch (error) {
    console.error('All attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attendance/reports/monthly — Monthly attendance report (Admin only)
router.get('/reports/monthly', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { month, department, employee_id } = req.query;

    // Default to current month if not specified
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    let query = `
      SELECT 
        u.id as user_id,
        u.name,
        u.email,
        u.department,
        COUNT(a.id) as days_present,
        COUNT(CASE WHEN a.check_out IS NOT NULL THEN 1 END) as full_days,
        MIN(a.check_in::text) as earliest_checkin,
        MAX(a.check_out::text) as latest_checkout,
        ROUND(AVG(
          CASE WHEN a.check_out IS NOT NULL THEN
            EXTRACT(EPOCH FROM (a.check_out::timestamp - a.check_in::timestamp)) / 3600
          END
        )::numeric, 2) as avg_hours_per_day
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id 
        AND TO_CHAR(a.date, 'YYYY-MM') = $1
      WHERE u.role = 'employee'
    `;

    const params = [targetMonth];
    let paramIndex = 2;

    if (department) {
      query += ` AND u.department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    if (employee_id) {
      query += ` AND u.id = $${paramIndex}`;
      params.push(employee_id);
      paramIndex++;
    }

    query += ' GROUP BY u.id, u.name, u.email, u.department ORDER BY u.name ASC';

    const report = await db.all(query, params);

    // Calculate working days in the month
    const [year, mon] = targetMonth.split('-').map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    let workingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, mon - 1, d).getDay();
      if (day !== 0 && day !== 6) workingDays++;
    }

    res.json({
      month: targetMonth,
      workingDays,
      report: report.map(r => ({
        ...r,
        days_present: parseInt(r.days_present) || 0,
        full_days: parseInt(r.full_days) || 0,
        days_absent: workingDays - (parseInt(r.days_present) || 0),
        avg_hours_per_day: parseFloat(r.avg_hours_per_day) || 0
      }))
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
