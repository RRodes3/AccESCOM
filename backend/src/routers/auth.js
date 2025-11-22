// backend/src/routers/auth.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const { cookieOptions } = require('../utils/cookies');
const axios = require('axios');
const { transporter, sendPasswordResetEmail } = require('../utils/mailer');

const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA = /^\d{10}$/;
const RE_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_DOT = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_GENERIC = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const SECRET = process.env.JWT_SECRET || 'dev-secret';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

const FORGOT_WINDOW_MS = 30 * 60 * 1000;
const FORGOT_MAX_ATTEMPTS = 3;

const loginAttemptsMap = new Map();
const forgotAttemptsMap = new Map();

const prisma = new PrismaClient();

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function sanitizeName(s) {
  return String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);
}

function buildFullName(firstName, lastNameP, lastNameM) {
  return [firstName, lastNameP, lastNameM].map(sanitizeName).filter(Boolean).join(' ');
}

/* -------------------------------- REGISTER ------------------------------- */
router.post('/register', async (req, res) => {
  try {
    let {
      boleta, firstName, lastNameP, lastNameM,
      email, password, institutionalType, contactEmail
    } = req.body || {};

    boleta = (boleta || '').trim();
    firstName = sanitizeName(firstName);
    lastNameP = sanitizeName(lastNameP);
    lastNameM = sanitizeName(lastNameM);
    email = String(email || '').trim().toLowerCase();
    contactEmail = contactEmail ? String(contactEmail).trim().toLowerCase() : null;

    const errors = {};
    if (!RE_BOLETA.test(boleta)) errors.boleta = 'La boleta debe tener 10 dígitos.';
    if (!firstName) errors.firstName = 'El nombre es obligatorio.';
    if (!lastNameP) errors.lastNameP = 'El apellido paterno es obligatorio.';
    if (!lastNameM) errors.lastNameM = 'El apellido materno es obligatorio.';
    if (!email) errors.email = 'Correo obligatorio.';
    if (contactEmail && !RE_EMAIL_GENERIC.test(contactEmail)) errors.contactEmail = 'Correo de contacto inválido.';
    if (!RE_PASSWORD.test(password)) errors.password = 'Contraseña inválida.';

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validación fallida', errors });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Correo ya registrado.' });

    const hash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        boleta, firstName, lastNameP, lastNameM,
        name: buildFullName(firstName, lastNameP, lastNameM),
        email,
        contactEmail,
        password: hash,
        role: 'USER',
        institutionalType: institutionalType || null,
      },
      select: {
        id: true, name: true, email: true, contactEmail: true, role: true,
        boleta: true, firstName: true, lastNameP: true, lastNameM: true
      }
    });

    return res.json({ ok: true, user: created });
  } catch (e) {
    console.error('REGISTER ERROR:', e);
    return res.status(500).json({ error: 'No se pudo registrar' });
  }
});

/* -------------------------------- LOGIN ---------------------------------- */
router.post('/login', async (req, res) => {
  try {
    const { email, password, captcha } = req.body;

    const normEmail = String(email || '').trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normEmail },
      select: {
        id: true, email: true, contactEmail: true, role: true, name: true,
        firstName: true, lastNameP: true, lastNameM: true,
        password: true, boleta: true, photoUrl: true, isActive: true,
      }
    });

    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

    if (!user.isActive) {
      return res.status(403).json({ error: 'Cuenta deshabilitada' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Reiniciar timestamp de actividad al iniciar sesión
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() }
    });

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, {
      expiresIn: '7d'
    });

    res.cookie('token', token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    delete user.password;
    return res.json({ user });
  } catch (e) {
    console.error('LOGIN ERROR:', e);
    return res.status(500).json({ error: 'Error en el login' });
  }
});

/* -------------------------------- LOGOUT --------------------------------- */
router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ ok: true });
});

/* -------------------------------- ME ------------------------------------- */
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

/* ----------------------------- CONTACT EMAIL ----------------------------- */
router.put('/contact-email', auth, async (req, res) => {
  try {
    const { contactEmail } = req.body;
    if (!contactEmail) return res.status(400).json({ ok: false, message: 'Correo inválido' });

    const emailTrimmed = String(contactEmail).trim().toLowerCase();
    if (!RE_EMAIL_GENERIC.test(emailTrimmed)) {
      return res.status(400).json({ ok: false, message: 'Correo no válido' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { contactEmail: emailTrimmed }
    });

    return res.json({ ok: true, message: 'Correo actualizado', user: updated });
  } catch (e) {
    console.error('UPDATE CONTACT ERROR:', e);
    return res.status(500).json({ ok: false, message: 'Error interno' });
  }
});

module.exports = router;
