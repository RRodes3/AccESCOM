// backend/server.js

const qrRoutes = require('./src/routers/qr');
app.use('/api/qr', qrRoutes);

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./src/routes/auth');

const app = express();

// Middlewares base
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
  })
);

// Healthcheck
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Rutas
app.use('/api/auth', authRoutes);

// Arrancar
const PORT = process.env.PORT || 3000; // mantengo 3000 según tu setup
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
