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

    if (!institutionalType) {
      if (/@alumno\.ipn\.mx$/i.test(email)) {
        institutionalType = 'STUDENT';
      } else if (/@ipn\.mx$/i.test(email)) {
        institutionalType = 'TEACHER';
      }
    }

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

// --- Recuperación de contraseña ---
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const normEmail = String(email).trim().toLowerCase();
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    const key = `${ip}_${normEmail}`;
    const now = Date.now();
    const entry = forgotAttemptsMap.get(key);

    if (entry) {
      const elapsed = now - entry.first;
      if (elapsed < FORGOT_WINDOW_MS && entry.count >= FORGOT_MAX_ATTEMPTS) {
        const remainMin = Math.ceil((FORGOT_WINDOW_MS - elapsed) / 60000);
        return res.status(429).json({ error: `Demasiados intentos. Intenta en ${remainMin} minuto(s).` });
      }
      if (elapsed >= FORGOT_WINDOW_MS) {
        forgotAttemptsMap.delete(key);
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: normEmail },
      select: {
        id: true, email: true, contactEmail: true,
        name: true, firstName: true, lastNameP: true, lastNameM: true,
        isActive: true
      }
    });

    const successMsg = 'Si el correo existe, recibirás un enlace de recuperación.';

    if (!user || !user.isActive) {
      if (!entry) forgotAttemptsMap.set(key, { first: now, count: 1 });
      else entry.count++;
      return res.json({ ok: true, message: successMsg });
    }

    await prisma.passwordReset.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { expiresAt: new Date() }
    });

    // Generar token aleatorio (este se envía al usuario)
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Hashear el token antes de guardarlo en BD
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: tokenHash,  // Guardar el hash, NO el token original
        expiresAt,
        ip,
        userAgent: req.headers['user-agent'] || null
      }
    });

    const recipientEmail = user.contactEmail || user.email;
    const userName = [user.firstName, user.lastNameP, user.lastNameM].filter(Boolean).join(' ') || user.name || 'Usuario';
    const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;  // Enviar token original

    console.log(`📧 Enviando reset a: ${recipientEmail}`);
    console.log(`🔗 Link: ${resetUrl}`);

    await sendPasswordResetEmail({
      to: recipientEmail,
      name: userName,
      resetUrl
    });

    if (!entry) forgotAttemptsMap.set(key, { first: now, count: 1 });
    else entry.count++;

    return res.json({ ok: true, message: successMsg });
  } catch (e) {
    console.error('FORGOT PASSWORD ERROR:', e);
    return res.status(500).json({ error: 'Error al procesar solicitud' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const rawToken = String(req.body?.token || '').trim();

    // acepta password o newPassword por si acaso
    const newPassword = String(
      req.body?.password || req.body?.newPassword || ''
    );

    if (!rawToken || !RE_PASSWORD.test(newPassword)) {
      return res.status(400).json({
        ok: false,
        error: 'Token inválido o contraseña no cumple política.',
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const pr = await prisma.passwordReset.findUnique({
      where: { token: tokenHash },
    });

    if (!pr || pr.usedAt || pr.expiresAt <= new Date()) {
      return res
        .status(400)
        .json({ ok: false, error: 'Enlace inválido o expirado.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: pr.userId },
    });

    if (!user || user.role !== 'USER' || !user.isActive) {
      return res.status(400).json({
        ok: false,
        error: 'No es posible restablecer para esta cuenta.',
      });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hash },
      }),
      prisma.passwordReset.update({
        where: { id: pr.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordReset.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
          NOT: { id: pr.id },
        },
        data: { expiresAt: new Date() },
      }),
    ]);

    return res.json({
      ok: true,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, error: 'No se pudo restablecer la contraseña' });
  }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Faltan campos' });
    }
    if (!RE_PASSWORD.test(newPassword)) {
      return res.status(400).json({ error: 'Contraseña nueva no válida.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, password: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Usuario inválido' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, mustChangePassword: false }
    });

    console.log(`✅ Change password user ${user.id}`);
    return res.json({ ok: true, message: 'Contraseña cambiada.' });
  } catch (e) {
    console.error('CHANGE PASSWORD ERROR:', e);
    return res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
