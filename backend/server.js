// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// ---------- Middlewares ----------
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
    credentials: true,
  })
);

// ---------- Rutas API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const importPhotosRouter = require('./src/routers/importPhotos');

app.use('/api/auth', require('./src/routers/auth'));
app.use('/api/admin/import', require('./src/routers/adminImport')); // PRIMERO
app.use('/api/admin', require('./src/routers/adminUsers'));          // DESPUÉS
app.use('/api/qr', require('./src/routers/qr'));
app.use('/api/guest', require('./src/routers/guest'));
app.use('/api/import', require('./src/routers/adminImport')); // alternativa
app.use('/api/profile', require('./src/routers/profile'));

// Monta router de fotos (Cloudinary)
// Endpoints: POST /api/admin/import-photos, DELETE /api/admin/import-photos/:boletaOrEmail
app.use('/api', importPhotosRouter);

// Servir fotos de usuarios (legacy en disco, por si lo sigues usando)
app.use(
  '/photos',
  express.static(path.join(__dirname, 'public', 'photos'))
);

// (opcional) raíz
app.get('/', (_req, res) =>
  res.send('servidor funcionando correctamente')
);

// ---------- Proveedor de correo + CRON JOBS ----------
const { initEmailProvider } = require('./src/utils/mailer');
const { setupDailyResetJobs } = require('./src/jobs/dailyReset');

try {
  initEmailProvider();
  console.log('✅ Proveedor de correo inicializado (Resend)');
} catch (err) {
  console.error(
    '⚠️ No se pudo inicializar el proveedor de correo:',
    err?.message || err
  );
}

setupDailyResetJobs({
  runOnStart: false,
});

// ---------- Arranque ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
