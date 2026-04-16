import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import attendanceRoutes from './routes/attendance.js';
import employeesRoutes from './routes/employees.js';
import leaveRoutes from './routes/leave.js';
import analyticsRoutes from './routes/analytics.js';
import announcementsRoutes from './routes/announcements.js';
import departmentsRoutes from './routes/departments.js';
import positionsRoutes from './routes/positions.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/positions', positionsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 HR Attendance Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n👤 Admin credentials:`);
  console.log(`   Email: admin@company.com`);
  console.log(`   Password: admin123\n`);
});
