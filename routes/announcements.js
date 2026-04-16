import express from 'express';
import db from '../models/database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Ensure announcements table exists
const ensureTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'general',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Error ensuring announcements table:', err);
  }
};
ensureTable();

// GET /api/announcements — List all announcements (all authenticated users)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const announcements = await db.all(`
      SELECT a.*, u.name as created_by_name
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
      LIMIT 50
    `, []);

    res.json({ announcements });
  } catch (error) {
    console.error('Announcements list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/announcements — Create announcement (Admin only)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const adminId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const result = await db.query(`
      INSERT INTO announcements (title, content, type, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [title, content, type || 'general', adminId]);

    res.json({ message: 'Announcement created', announcement: result.rows[0] });
  } catch (error) {
    console.error('Announcement create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/announcements/:id — Delete announcement (Admin only)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await db.get('SELECT * FROM announcements WHERE id = $1', [id]);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    await db.query('DELETE FROM announcements WHERE id = $1', [id]);

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Announcement delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
