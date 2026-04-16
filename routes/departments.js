import express from 'express';
import db from '../models/database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Default departments list
const DEFAULT_DEPARTMENTS = [
  'Administration',
  'Engineering',
  'HR',
  'Finance',
  'Marketing',
  'Sales',
  'IT',
  'Operations',
  'Legal',
  'QA'
];

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

// GET /api/departments — List all departments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const dbDepts = await db.all(`
      SELECT DISTINCT department as name
      FROM users
      WHERE department IS NOT NULL AND department != ''
      ORDER BY department ASC
    `, []);

    const dbNames = dbDepts.map(d => d.name);
    const combined = [...new Set([...DEFAULT_DEPARTMENTS, ...dbNames])].sort();

    res.json({ departments: combined.map(name => ({ name })) });
  } catch (error) {
    console.error('Departments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { DEFAULT_POSITIONS };
export default router;
