import express from 'express';
import db from '../models/database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Ensure leave tables exist
const ensureTables = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        leave_type TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        leave_type TEXT NOT NULL,
        total_days INTEGER DEFAULT 0,
        used_days INTEGER DEFAULT 0,
        year INTEGER NOT NULL,
        UNIQUE(user_id, leave_type, year)
      )
    `);
  } catch (err) {
    console.error('Error ensuring leave tables:', err);
  }
};
ensureTables();

// Helper: calculate business days between two dates
function calcDays(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count || 1;
}

// POST /api/leave/apply — Employee applies for leave
router.post('/apply', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { leave_type, start_date, end_date, reason } = req.body;

    if (!leave_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'leave_type, start_date, and end_date are required' });
    }

    const result = await db.query(`
      INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *
    `, [userId, leave_type, start_date, end_date, reason || '']);

    res.json({ message: 'Leave application submitted', leave: result.rows[0] });
  } catch (error) {
    console.error('Leave apply error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leave/my — Employee lists their own leaves
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const leaves = await db.all(`
      SELECT lr.*, u.name as reviewer_name
      FROM leave_requests lr
      LEFT JOIN users u ON lr.reviewed_by = u.id
      WHERE lr.user_id = $1
      ORDER BY lr.created_at DESC
    `, [userId]);

    res.json({ leaves });
  } catch (error) {
    console.error('Leave my error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leave/balances — Employee gets their leave balances
router.get('/balances', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const year = new Date().getFullYear();

    // Ensure default balances exist for this user
    const leaveTypes = [
      { type: 'annual', total: 15 },
      { type: 'sick', total: 10 },
      { type: 'personal', total: 5 },
      { type: 'unpaid', total: 30 }
    ];

    for (const lt of leaveTypes) {
      await db.query(`
        INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, year)
        VALUES ($1, $2, $3, 0, $4)
        ON CONFLICT (user_id, leave_type, year) DO NOTHING
      `, [userId, lt.type, lt.total, year]);
    }

    // Recalculate used days from approved leaves
    for (const lt of leaveTypes) {
      const approvedLeaves = await db.all(`
        SELECT start_date, end_date FROM leave_requests
        WHERE user_id = $1 AND leave_type = $2 AND status = 'approved'
        AND EXTRACT(YEAR FROM start_date) = $3
      `, [userId, lt.type, year]);

      const usedDays = approvedLeaves.reduce((sum, l) => sum + calcDays(l.start_date, l.end_date), 0);

      await db.query(`
        UPDATE leave_balances SET used_days = $1
        WHERE user_id = $2 AND leave_type = $3 AND year = $4
      `, [usedDays, userId, lt.type, year]);
    }

    const balances = await db.all(`
      SELECT leave_type, total_days, used_days, (total_days - used_days) as remaining_days, year
      FROM leave_balances
      WHERE user_id = $1 AND year = $2
      ORDER BY leave_type
    `, [userId, year]);

    res.json({ balances });
  } catch (error) {
    console.error('Leave balances error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leave/pending — Admin lists pending leaves
router.get('/pending', authenticateToken, isAdmin, async (req, res) => {
  try {
    const leaves = await db.all(`
      SELECT lr.*, u.name as employee_name, u.email as employee_email, u.department
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE lr.status = 'pending'
      ORDER BY lr.created_at ASC
    `, []);

    res.json({ leaves });
  } catch (error) {
    console.error('Leave pending error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/leave/:id/approve — Admin approves a leave
router.put('/:id/approve', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const leave = await db.get('SELECT * FROM leave_requests WHERE id = $1', [id]);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is not in pending status' });

    await db.query(`
      UPDATE leave_requests
      SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
      WHERE id = $2
    `, [adminId, id]);

    res.json({ message: 'Leave approved successfully' });
  } catch (error) {
    console.error('Leave approve error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/leave/:id/reject — Admin rejects a leave
router.put('/:id/reject', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason } = req.body;

    const leave = await db.get('SELECT * FROM leave_requests WHERE id = $1', [id]);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is not in pending status' });

    await db.query(`
      UPDATE leave_requests
      SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW()
      WHERE id = $2
    `, [adminId, id]);

    res.json({ message: 'Leave rejected successfully' });
  } catch (error) {
    console.error('Leave reject error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
