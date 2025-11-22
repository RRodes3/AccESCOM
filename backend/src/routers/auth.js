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

const RE_LETTERS   = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA    = /^\d{10}$/;
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_DOT     = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_GENERIC = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const SECRET = process.env.JWT_SECRET || 'dev-secret';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

const FORGOT_WINDOW_MS = 30 * 60 * 1000;
const FORGOT_MAX_ATTEMPTS = 3;

const loginAttemptsMap = new Map();
const forgotAttemptsMap = new Map();

const isInstitutional = (email = '') =>
  RE_EMAIL_DOT.test(email.trim()) || RE_EMAIL_COMPACT.test(email.trim());

const sanitizeName = (s) =>
  String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);

const buildFullName = (firstName, lastNameP, lastNameM) => {
  const parts = [firstName, lastNameP, lastNameM]
    .map(sanitizeName)
    .filter(Boolean);
  return (parts.join(' ') || 'Usuario').slice(0, 120);
};

const prisma = new PrismaClient();

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function makeRateKey(ip, email) {
  return `${ip || 'unknown'}::${email || ''}`;
}

function isBlocked(map, key, windowMs, maxAttempts) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry) return false;
  if (now - entry.firstAt > windowMs) {
    map.delete(key);
    return false;
  }
  return entry.count >= maxAttempts;
}

function registerFailure(map, key, windowMs) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.firstAt > windowMs) {
    map.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

function resetAttempts(map, key) {
  map.delete(key);
}

function isLoginRateLimited(ip, email) {
  const key = makeRateKey(ip, email);
  return isBlocked(loginAttemptsMap, key, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS);
}

function registerLoginFailure(ip, email) {
  const key = makeRateKey(ip, email);
  registerFailure(loginAttemptsMap, key, LOGIN_WINDOW_MS);
}

function resetLoginAttempts(ip, email) {
  const key = makeRateKey(ip, email);
  resetAttempts(loginAttemptsMap, key);
}

function isForgotRateLimited(ip, email) {
  const key = makeRateKey(ip, email);
  return isBlocked(forgotAttemptsMap, key, FORGOT_WINDOW_MS, FORGOT_MAX_ATTEMPTS);
}

function registerForgotAttempt(ip, email) {
  const key = makeRateKey(ip, email);
  registerFailure(forgotAttemptsMap, key, FORGOT_WINDOW_MS);
}

/* REGISTER */
router.post('/register', async (req, res) => {
  try {
    let {
      boleta, firstName, lastNameP, lastNameM,
      name, email, password,
      institutionalType,
      contactEmail
    } = req.body || {};

    boleta       = (boleta || '').trim();
    firstName    = sanitizeName(firstName);
    lastNameP    = sanitizeName(lastNameP);
    lastNameM    = sanitizeName(lastNameM);
    email        = String(email || '').trim().toLowerCase();
    contactEmail = (contactEmail && String(contactEmail).trim()) 
      ? String(contactEmail).trim().toLowerCase() 
      : null;
    password     = String(password || '');

    const INSTITUTIONAL_TYPES = ['STUDENT','TEACHER','PAE'];
    if (institutionalType && !INSTITUTIONAL_TYPES.includes(String(institutionalType))) {
      return res.status(400).json({ error: 'institutionalType inválido' });
    }

    const errors = {};
    if (!RE_BOLETA.test(boleta)) errors.boleta = 'La boleta debe tener exactamente 10 dígitos.';
    if (!firstName) errors.firstName = 'El nombre es obligatorio.';
    else if (!RE_LETTERS.test(firstName)) errors.firstName = 'Usa solo letras y espacios.';
    if (!lastNameP) errors.lastNameP = 'El apellido paterno es obligatorio.';
    else if (!RE_LETTERS.test(lastNameP)) errors.lastNameP = 'Usa solo letras y espacios.';
    if (!lastNameM) errors.lastNameM = 'El apellido materno es obligatorio.';
    else if (!RE_LETTERS.test(lastNameM)) errors.lastNameM = 'Usa solo letras y espacios.';
    if (!email) errors.email = 'El correo es obligatorio.';
    else if (!isInstitutional(email)) errors.email = 'Usa tu correo institucional (@ipn.mx o @alumno.ipn.mx).';
    if (contactEmail && !RE_EMAIL_GENERIC.test(contactEmail)) errors.contactEmail = 'Correo de contacto inválido.';
    if (!RE_PASSWORD.test(password)) errors.password = 'Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.';

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validación fallida', errors });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Este correo ya está registrado.' });

    const fullName = name?.trim()
      ? sanitizeName(name)
      : buildFullName(firstName, lastNameP, lastNameM);

    const hash = await bcrypt.hash(password, 10);

    let resolvedInstitutionalType = institutionalType || null;
    if (!resolvedInstitutionalType) {
      if (/@alumno\.ipn\.mx$/i.test(email)) {
        resolvedInstitutionalType = 'STUDENT';
      } else if (/@ipn\.mx$/i.test(email)) {
        resolvedInstitutionalType = 'TEACHER';
      }
    }

    const created = await prisma.user.create({
      data: {
        boleta,
        firstName,
        lastNameP,
        lastNameM,
        name: fullName,
        email,
        contactEmail,
        password: hash,
        role: 'USER',
        institutionalType: resolvedInstitutionalType,
      },
      select: {
        id: true, name: true, email: true, contactEmail: true, role: true, boleta: true,
        firstName: true, lastNameP: true, lastNameM: true, institutionalType: true
      }
    });

    return res.json({ ok:true, user: created });
  } catch (e) {
    console.error('REGISTER ERROR:', e);
    return res.status(500).json({ error:'No se pudo registrar' });
  }
});

/* LOGIN */
router.post('/login', async (req, res) => {
  try {
    const { email, password, captcha } = req.body;
    const ip = getClientIp(req);
    const normEmail = String(email || '').trim().toLowerCase();

    if (isLoginRateLimited(ip, normEmail)) {
      return res.status(429).json({
        error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.'
      });
    }

    if (!captcha) {
      return res.status(400).json({ error: 'Falta validar el captcha' });
    }

    try {
      const googleResp = await axios.post(
        'https://www.google.com/recaptcha/api/siteverify',
        null,
        {
          params: {
            secret: process.env.RECAPTCHA_SECRET,
            response: captcha,
          },
        }
      );

      const g = googleResp.data;
      const score = typeof g.score === 'number' ? g.score : 0;

      if (!g.success || score < 0.5) {
        return res.status(400).json({ error: 'Captcha inválido' });
      }
    } catch (err) {
      console.error('Error verificando reCAPTCHA:', err?.message || err);
      return res.status(500).json({ error: 'Error al validar captcha' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normEmail },
      select: {
        id: true,
        email: true,
        contactEmail: true,
        role: true,
        name: true,
        firstName: true,
        lastNameP: true,
        lastNameM: true,
        boleta: true,
        password: true,
        mustChangePassword: true,
        institutionalType: true,
        photoUrl: true,
        photoPublicId: true,
        isActive: true,
      },
    });

    if (!user) {
      registerLoginFailure(ip, normEmail);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (!user.isActive) {
      registerLoginFailure(ip, normEmail);
      return res
        .status(403)
        .json({ error: 'Tu cuenta ha sido deshabilitada. Contacta al administrador.' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      registerLoginFailure(ip, normEmail);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    resetLoginAttempts(ip, normEmail);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() },
    });

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, {
      expiresIn: '7d',
    });

    res.cookie('token', token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { password: _pw, ...sanitized } = user;
    return res.json({ user: sanitized });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Error en el login' });
  }
});

/* LOGOUT */
router.post('/logout', (req, res) => {
  res
    .clearCookie('token', { ...cookieOptions, maxAge: 0 })
    .json({ ok: true });
});

/* ME */
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

/* FORGOT PASSWORD */
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ua = req.headers['user-agent'] || '';
    const ip = getClientIp(req);

    if (isForgotRateLimited(ip, email)) {
      return res.status(429).json({
        ok: false,
        error: 'Has solicitado demasiados restablecimientos. Intenta más tarde.'
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (user?.role === 'USER' && user?.isActive) {
      await prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date() }
      });

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt,
          ip,
          userAgent: ua
        }
      });

      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

      try {
        const recipients = [user.email, user.contactEmail].filter(Boolean).join(',');
        await sendPasswordResetEmail({ to: recipients, name: user.name, resetUrl });
      } catch (mailErr) {
        console.error('EMAIL SEND ERROR:', mailErr?.response || mailErr);
      }
    }

    registerForgotAttempt(ip, email);

    return res.json({ ok: true, message: 'Si el correo existe, enviaremos un enlace para restablecer.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar la solicitud' });
  }
});

/* RESET PASSWORD */
router.post('/reset-password', async (req, res) => {
  try {
    const rawToken = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.password || '');

    if (!rawToken || !RE_PASSWORD.test(newPassword)) {
      return res.status(400).json({ ok: false, error: 'Token inválido o contraseña no cumple política.' });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const pr = await prisma.passwordReset.findUnique({ where: { token: tokenHash } });
    if (!pr || pr.usedAt || pr.expiresAt <= new Date()) {
      return res.status(400).json({ ok: false, error: 'Enlace inválido o expirado.' });
    }

    const user = await prisma.user.findUnique({ where: { id: pr.userId } });
    if (!user || user.role !== 'USER' || !user.isActive) {
      return res.status(400).json({ ok: false, error: 'No es posible restablecer para esta cuenta.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hash } }),
      prisma.passwordReset.update({ where: { id: pr.id }, data: { usedAt: new Date() } }),
      prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() }, NOT: { id: pr.id } },
        data:  { expiresAt: new Date() }
      })
    ]);

    return res.json({ ok: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'No se pudo restablecer la contraseña' });
  }
});

/* CHANGE PASSWORD */
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Debes indicar tu contraseña actual y la nueva.' });
    }

    if (!RE_PASSWORD.test(newPassword)) {
      return res.status(400).json({
        error: 'La nueva contraseña no cumple con los requisitos.',
        details: 'Debe tener al menos 12 caracteres, con mayúsculas, minúsculas, número y símbolo.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, mustChangePassword: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }

    const samePwd = await bcrypt.compare(newPassword, user.password);
    if (samePwd) {
      return res.status(400).json({
        error: 'La nueva contraseña no puede ser igual a la actual.'
      });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        mustChangePassword: false,
      }
    });

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente.' });
  } catch (e) {
    console.error('CHANGE PASSWORD ERROR:', e);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña.' });
  }
});

/* CONTACT EMAIL */
router.put('/contact-email', auth, async (req, res) => {
  try {
    const { contactEmail } = req.body;
    if (!contactEmail || typeof contactEmail !== 'string') {
      return res.status(400).json({ ok: false, message: 'Correo de contacto inválido' });
    }
    const emailTrimmed = contactEmail.trim().toLowerCase();
    if (!RE_EMAIL_GENERIC.test(emailTrimmed) || emailTrimmed.length > 190) {
      return res.status(400).json({ ok: false, message: 'Formato de correo no válido' });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { contactEmail: emailTrimmed },
      select: {
        id: true,
        email: true,
        contactEmail: true,
        name: true,
        firstName: true,
        lastNameP: true,
        lastNameM: true,
        institutionalType: true,
        boleta: true,
        role: true,
        mustChangePassword: true,
        photoUrl: true,
        isActive: true
      }
    });
    return res.json({
      ok: true,
      message: 'Correo de contacto actualizado correctamente',
      user: updated
    });
  } catch (err) {
    console.error('auth/contact-email error:', err);
    return res.status(500).json({ ok: false, message: 'Error actualizando correo de contacto' });
  }
});

module.exports = router;

/* MIDDLEWARE AUTH */
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || '15');

module.exports = async function auth(req, res, next) {
  try {
    // Soporte para cookie o header Authorization
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    // ⚠️ Validar si está deshabilitado
    if (!user.isActive) {
      res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      return res.status(403).json({ 
        error: 'Tu cuenta ha sido deshabilitada. Contacta al administrador.' 
      });
    }

    // ⏱️ Check de inactividad
    const now = new Date();
    if (user.lastActivityAt) {
      const diffMs = now - user.lastActivityAt;
      const diffMin = diffMs / 60000;
      if (diffMin > IDLE_MINUTES) {
        // Limpia cookie y marca sesión expirada
        res.clearCookie('token', {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
        return res.status(401).json({ error: 'Sesión expirada por inactividad' });
      }
    }

    // Actualizar lastActivityAt (no bloqueamos la petición si falla)
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastActivityAt: now },
      })
      .catch((e) => console.error('Error actualizando lastActivityAt:', e));

    // Colgar info mínima en req.user para el resto de rutas
    req.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      boleta: user.boleta,
      accessState: user.accessState,
      mustChangePassword: user.mustChangePassword,
      institutionalType: user.institutionalType,
      photoUrl: user.photoUrl,
      contactEmail: user.contactEmail, // ✅ Agregado
    };

    return next();
  } catch (e) {
    console.error('AUTH MIDDLEWARE ERROR:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
