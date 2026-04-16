import express from 'express';
import db from '../models/database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/analytics/overview — Overall stats
router.get('/overview', authenticateToken, isAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalEmployees = await db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'employee'`);
    const presentToday = await db.get(`SELECT COUNT(*) as count FROM attendance WHERE date = $1`, [today]);
    const checkedOut = await db.get(`SELECT COUNT(*) as count FROM attendance WHERE date = $1 AND check_out IS NOT NULL`, [today]);

    // Leave stats this month
    const thisMonth = new Date().toISOString().slice(0, 7);
    let pendingLeaves = { count: 0 };
    let approvedLeaves = { count: 0 };
    try {
      pendingLeaves = await db.get(`SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'`);
      approvedLeaves = await db.get(`
        SELECT COUNT(*) as count FROM leave_requests 
        WHERE status = 'approved' AND TO_CHAR(start_date, 'YYYY-MM') = $1
      `, [thisMonth]);
    } catch (e) {
      // leave_requests table may not exist yet
    }

    const total = parseInt(totalEmployees.count);
    const present = parseInt(presentToday.count);

    res.json({
      overview: {
        totalEmployees: total,
        presentToday: present,
        absentToday: total - present,
        checkedOut: parseInt(checkedOut.count),
        pendingLeaves: parseInt(pendingLeaves.count),
        approvedLeavesThisMonth: parseInt(approvedLeaves.count),
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/attendance-trends — Last 30 days trends
router.get('/attendance-trends', authenticateToken, isAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const trends = await db.all(`
      SELECT 
        a.date::text as date,
        COUNT(DISTINCT a.user_id) as present,
        COUNT(CASE WHEN a.check_out IS NOT NULL THEN 1 END) as checked_out
      FROM attendance a
      WHERE a.date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY a.date
      ORDER BY a.date ASC
    `, []);

    // Get total employees for absent calculation
    const totalEmp = await db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'employee'`);
    const total = parseInt(totalEmp.count);

    const trendsWithAbsent = trends.map(row => ({
      date: row.date,
      present: parseInt(row.present),
      absent: total - parseInt(row.present),
      checkedOut: parseInt(row.checked_out)
    }));

    res.json({ trends: trendsWithAbsent });
  } catch (error) {
    console.error('Attendance trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/department-distribution — Employees by department
router.get('/department-distribution', authenticateToken, isAdmin, async (req, res) => {
  try {
    const distribution = await db.all(`
      SELECT 
        COALESCE(department, 'Unassigned') as department,
        COUNT(*) as count
      FROM users
      WHERE role = 'employee'
      GROUP BY department
      ORDER BY count DESC
    `, []);

    res.json({ distribution });
  } catch (error) {
    console.error('Department distribution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/leave-usage — Leave usage statistics
router.get('/leave-usage', authenticateToken, isAdmin, async (req, res) => {
  try {
    let leaveStats = [];
    let monthlyLeaves = [];

    try {
      // Leave type breakdown
      leaveStats = await db.all(`
        SELECT 
          leave_type,
          COUNT(*) as total_requests,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
        FROM leave_requests
        GROUP BY leave_type
        ORDER BY total_requests DESC
      `, []);

      // Monthly leave trends (last 6 months)
      monthlyLeaves = await db.all(`
        SELECT 
          TO_CHAR(start_date, 'YYYY-MM') as month,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved
        FROM leave_requests
        WHERE start_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY TO_CHAR(start_date, 'YYYY-MM')
        ORDER BY month ASC
      `, []);
    } catch (e) {
      // leave_requests table may not exist yet
    }

    res.json({ leaveStats, monthlyLeaves });
  } catch (error) {
    console.error('Leave usage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
