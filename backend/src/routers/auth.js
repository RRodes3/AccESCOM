const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const auth = require('../middleware/auth');        // ajusta ruta si difiere
const { cookieOptions } = require('../utils/cookies');
const axios = require('axios');

const RE_LETTERS   = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;         // letras y espacios
const RE_BOLETA    = /^\d{10}$/;                             // exactamente 10 dígitos
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/; //contraseña fuerte
const RE_EMAIL_DOT     = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i; // email tipo "iniciales.apellido"
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;

const SECRET = process.env.JWT_SECRET || 'dev-secret';

const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email||'').trim()) || RE_EMAIL_COMPACT.test((email||'').trim());

const sanitizeName = (s) =>
  String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);

const buildFullName = (firstName, lastNameP, lastNameM) => {
  const parts = [firstName, lastNameP, lastNameM].map(sanitizeName).filter(Boolean);
  return (parts.join(' ') || 'Usuario').slice(0, 120);
};

const prisma = new PrismaClient();

/* ---------- REGISTER ---------- */
router.post('/register', async (req, res) => {
  try {
    // 1) Extrae y normaliza entradas
    let {
      boleta, firstName, lastNameP, lastNameM,
      name, email, password, /* role (ignorado) */
      institutionalType       // ← NUEVO (opcional)
    } = req.body || {};

    boleta     = (boleta || '').trim();
    firstName  = sanitizeName(firstName);
    lastNameP  = sanitizeName(lastNameP);
    lastNameM  = sanitizeName(lastNameM);
    email      = String(email || '').trim().toLowerCase();
    password   = String(password || '');

    // 2) Validación simple del institutionalType (opcional)
    const INSTITUTIONAL_TYPES = ['STUDENT','TEACHER','PAE'];
    if (institutionalType && !INSTITUTIONAL_TYPES.includes(String(institutionalType))) {
      return res.status(400).json({ error: 'institutionalType inválido' });
    }

    // 3) Valida campos (acumula errores para feedback de UI)
    const errors = {};
    if (!RE_BOLETA.test(boleta)) errors.boleta = 'La boleta debe tener exactamente 10 dígitos.';
    if (!firstName)              errors.firstName = 'El nombre es obligatorio.';
    else if (!RE_LETTERS.test(firstName)) errors.firstName = 'Usa solo letras y espacios.';
    if (!lastNameP)              errors.lastNameP = 'El apellido paterno es obligatorio.';
    else if (!RE_LETTERS.test(lastNameP)) errors.lastNameP = 'Usa solo letras y espacios.';
    if (!lastNameM)              errors.lastNameM = 'El apellido materno es obligatorio.';
    else if (!RE_LETTERS.test(lastNameM)) errors.lastNameM = 'Usa solo letras y espacios.';
    if (!email)                  errors.email = 'El correo es obligatorio.';
    else if (!isInstitutional(email)) errors.email = 'Usa tu correo institucional (@ipn.mx o @alumno.ipn.mx).';
    if (!RE_PASSWORD.test(password)) errors.password = 'Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.';

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validación fallida', errors });
    }

    // 3) Unicidad de email
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Este correo ya está registrado.' });

    // 4) Construye nombre completo (ignora "name" de entrada si vino vacío)
    const fullName = name?.trim() ? sanitizeName(name) : buildFullName(firstName, lastNameP, lastNameM);

    // 5) Hash de contraseña
    const hash = await bcrypt.hash(password, 10);

    // 5.1) Determinar sub-rol institucional si no fue enviado (solo para USER)
    let resolvedInstitutionalType = institutionalType || null;
    if (!resolvedInstitutionalType) {
      if (/@alumno\.ipn\.mx$/i.test(email)) {
        resolvedInstitutionalType = 'STUDENT';
      } else if (/@ipn\.mx$/i.test(email)) {
        resolvedInstitutionalType = 'TEACHER';
      }
    }
    
    // 6) Crea usuario (FORZAR role = 'USER' por seguridad)
    const created = await prisma.user.create({
      data: {
        boleta,
        firstName,
        lastNameP,
        lastNameM,
        name: fullName,
        email,
        password: hash,
        role: 'USER',
        institutionalType: resolvedInstitutionalType,
      },
      select: {
        id: true, name: true, email: true, role: true, boleta: true,
        firstName: true, lastNameP: true, lastNameM: true, institutionalType: true
      }
    });

    return res.json({ ok:true, user: created });
  } catch (e) {
    console.error('REGISTER ERROR:', e);
    return res.status(500).json({ error:'No se pudo registrar' });
  }
});


// ====== LOGIN con Super Admin + reCAPTCHA v3 ======
router.post('/login', async (req, res) => {
  try {
    const { email, password, captcha } = req.body;

    // 1) Validar que venga el token de captcha
    if (!captcha) {
      return res.status(400).json({ error: 'Falta validar el captcha' });
    }

    // 2) Verificar con Google reCAPTCHA v3
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

    // 3) Login normal: buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        firstName: true,
        lastNameP: true,
        lastNameM: true,
        boleta: true,
        password: true,               // 👈 campo real en el modelo
        mustChangePassword: true,
        institutionalType: true,
        photoUrl: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // 4) Validar contraseña usando user.password
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // 5) Actualizar lastActivityAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() },
    });

    // 6) Crear JWT y setear cookie
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, {
      expiresIn: '7d',
    });

    res.cookie('token', token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });

    // 7) Respuesta sanitizada (no mandamos la contraseña)
    const { password: _pw, ...sanitized } = user;

    return res.json({ user: sanitized });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Error en el login' });
  }
});


/* ---------- LOGOUT ---------- */
router.post('/logout', (req, res) => {
  res
    .clearCookie('token', { ...cookieOptions, maxAge: 0 })
    .json({ ok: true });
});

/* ---------- ME ---------- */
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

/* ---------- Contraseña olvidada (RESET) ---------- */
const { transporter, sendPasswordResetEmail } = require('../utils/mailer');

// POST /api/auth/forgot-password (pide el reset)
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ua = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';

    const user = await prisma.user.findUnique({ where: { email } });

    if (user?.role === 'USER' && user?.isActive) {
      await prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date() }
      });

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await prisma.passwordReset.create({
        data: { userId: user.id, token, expiresAt, ip, userAgent: ua }
      });

      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      console.log('🔗 resetUrl generado:', resetUrl);
      console.log('📬 Enviando a:', user.email);

      try {
        await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      } catch (mailErr) {
        console.error('EMAIL SEND ERROR:', mailErr?.response || mailErr);
      }
    }

    return res.json({ ok: true, message: 'Si el correo existe, enviaremos un enlace para restablecer.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar la solicitud' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.password || '');

    if (!token || !RE_PASSWORD.test(newPassword)) {
      return res.status(400).json({ ok: false, error: 'Token inválido o contraseña no cumple política.' });
    }

    const pr = await prisma.passwordReset.findUnique({ where: { token } });
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

// POST /api/auth/change-password
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

module.exports = router;
