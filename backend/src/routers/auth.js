// backend/src/routes/auth.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { cookieOptions } = require('../utils/cookies');

const prisma = new PrismaClient();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Faltan credenciales' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const payload = { id: user.id, role: user.role, email: user.email, name: user.name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
    // Enviar token en cookie httpOnly
    const body = { user: payload };
      // Para pruebas con Postman: también regresa el token en la respuesta.
      // Si prefieres limitarlo en prod:
    if (process.env.NODE_ENV !== 'production') body.token = token;
    body.token = token;
    res.cookie('token', token, cookieOptions).json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: 0 }).json({ ok: true });
});

// GET /api/auth/me   (protegida)
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
