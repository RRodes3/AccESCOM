// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

// ---------- Middlewares ----------
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map(s => s.trim()),
    credentials: true,
  })
);

// ---------- Rutas ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./src/routers/auth'));
app.use('/api/admin', require('./src/routers/adminUsers'));
app.use('/api/qr', require('./src/routers/qr'));
app.use('/api/guest', require('./src/routers/guest'));

// (opcional)
app.get('/', (_req, res) => res.send('servidor funcionando correctamente'));

const { transporter } = require('./src/utils/mailer');

// verifica disponibilidad SMTP (no bloquea el arranque)
transporter.verify()
  .then(() => console.log('✅ SMTP listo para enviar'))
  .catch(err => console.error('❌ SMTP no disponible:', err?.message || err));

// ---------- Arranque ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
