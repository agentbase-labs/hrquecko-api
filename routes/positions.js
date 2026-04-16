import express from 'express';
import db from '../models/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_POSITIONS = [
  'Manager',
  'Senior Engineer',
  'Engineer',
  'Junior Engineer',
  'HR Specialist',
  'HR Manager',
  'Analyst',
  'Senior Analyst',
  'Director',
  'VP',
  'CEO',
  'CTO',
  'CFO',
  'Designer',
  'QA Engineer',
  'DevOps Engineer',
  'Sales Representative',
  'Marketing Specialist',
  'Finance Manager',
  'Accountant'
];

// GET /api/positions — List all positions
router.get('/', authenticateToken, async (req, res) => {
  try {
    let dbPositions = [];
    try {
      dbPositions = await db.all(`
        SELECT DISTINCT position as name
        FROM users
        WHERE position IS NOT NULL AND position != ''
        ORDER BY position ASC
      `, []);
    } catch (e) {
      // position column might not exist yet
    }

    const dbNames = dbPositions.map(p => p.name);
    const combined = [...new Set([...DEFAULT_POSITIONS, ...dbNames])].sort();

    res.json({ positions: combined.map(name => ({ name })) });
  } catch (error) {
    console.error('Positions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
