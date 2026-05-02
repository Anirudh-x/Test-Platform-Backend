require('dotenv').config({ override: true }); // override any pre-existing system env vars
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set in .env — please add your MongoDB Atlas connection string.');
  process.exit(1);
}

// Mask password in logs for security
const safeUri = MONGO_URI.replace(/:([^@]+)@/, ':****@');

// Parse FRONTEND_URL — supports comma-separated or JSON array strings in .env
const rawFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
let CORS_ORIGINS;
try {
  // Handle JSON-style array: ['http://localhost:5173', ...]
  CORS_ORIGINS = JSON.parse(rawFrontend.replace(/'/g, '"'));
} catch {
  // Handle plain comma-separated: http://localhost:5173,http://localhost:3000
  CORS_ORIGINS = rawFrontend.split(',').map(s => s.trim());
}

// Middleware
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));
app.use(express.json());

// Create HTTP server & Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Setup signaling logic
require('./signaling')(io);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to MongoDB then start server
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas:', safeUri);
    server.listen(PORT, () => {
      console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
