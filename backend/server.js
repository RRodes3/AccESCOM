// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./src/routers/auth'); // OJO: tu carpeta es "routers"

const app = express();

// Middlewares base
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(','), // tu front corre en 3001
    credentials: true,
  })
);

// Healthcheck bajo /api
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Rutas de autenticación bajo /api/auth
app.use('/api/auth', authRoutes);

// Rutas de QR bajo /api/qr
const qrRoutes = require('./src/routers/qr');
app.use('/api/qr', qrRoutes);


// (Opcional) raíz simple
app.get('/', (_req, res) => res.send('servidor funcionando correctamente'));

// Arranque
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
