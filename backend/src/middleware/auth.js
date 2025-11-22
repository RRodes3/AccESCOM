// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Router } = require('express');
const router = Router();
const { getClientIp } = require('request-ip');
const { sendPasswordResetEmail } = require('../services/emailService');

// Sanitizar minutos de inactividad
function resolveIdleMinutes(raw) {
  if (!raw || typeof raw !== 'string') return 15;
  const trimmed = raw.trim();
  if (!trimmed) return 15;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1) return 15;
  return n;
}

const IDLE_MINUTES = resolveIdleMinutes(process.env.SESSION_IDLE_MINUTES);

// Opcional: solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  console.log('[AUTH] Inactividad configurada en', IDLE_MINUTES, 'minutos');
}

module.exports = async function auth(req, res, next) {
  try {
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) {
      res.clearCookie('token', cookieClearOpts());
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (!user.isActive) {
      res.clearCookie('token', cookieClearOpts());
      return res.status(403).json({ error: 'Tu cuenta ha sido deshabilitada. Contacta al administrador.' });
    }

    // Inactividad
    const now = Date.now();
    if (user.lastActivityAt) {
      let diffMin = (now - new Date(user.lastActivityAt).getTime()) / 60000;
      if (diffMin < 0) diffMin = 0; // defensa ante desajuste de reloj
      // Ignora expiración si acaba de iniciar (menos de 0.1 min ~ 6 seg)
      if (diffMin > IDLE_MINUTES && diffMin > 0.1) {
        res.clearCookie('token', cookieClearOpts());
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[AUTH] Expirando por inactividad. diffMin=${diffMin.toFixed(2)} limite=${IDLE_MINUTES}`);
        }
        return res.status(401).json({ error: 'Sesión expirada por inactividad' });
      }
    }

    // Actualizar último activity (no bloquear en error)
    prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() }
    }).catch(e => console.error('Error actualizando lastActivityAt:', e));

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
      contactEmail: user.contactEmail
    };

    return next();
  } catch (e) {
    console.error('AUTH MIDDLEWARE ERROR:', e);
    return res.status(401).json({ error: 'No autenticado' });
  }
};

function cookieClearOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
}

/* ------------------------- FORGOT PASSWORD --------------------------- */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const normEmail = String(email).trim().toLowerCase();
    const ip = getClientIp(req);

    // Rate limiting
    const key = `${ip}_${normEmail}`;
    const now = Date.now();
    const entry = forgotAttemptsMap.get(key);

    if (entry) {
      const elapsed = now - entry.first;
      if (elapsed < FORGOT_WINDOW_MS && entry.count >= FORGOT_MAX_ATTEMPTS) {
        const remainMin = Math.ceil((FORGOT_WINDOW_MS - elapsed) / 60000);
        return res.status(429).json({
          error: `Demasiados intentos. Intenta de nuevo en ${remainMin} minuto(s).`
        });
      }
      if (elapsed >= FORGOT_WINDOW_MS) {
        forgotAttemptsMap.delete(key);
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: normEmail },
      select: {
        id: true,
        email: true,
        contactEmail: true,
        name: true,
        firstName: true,
        lastNameP: true,
        lastNameM: true,
        isActive: true
      }
    });

    // Siempre responder lo mismo para evitar enumerar usuarios
    const successMsg = 'Si el correo existe, recibirás un enlace de recuperación.';

    if (!user || !user.isActive) {
      // Registrar intento
      if (!entry) {
        forgotAttemptsMap.set(key, { first: now, count: 1 });
      } else {
        entry.count++;
      }
      return res.json({ ok: true, message: successMsg });
    }

    // Invalidar tokens anteriores del usuario
    await prisma.passwordReset.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { expiresAt: new Date() }
    });

    // Generar nuevo token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        ip,
        userAgent: req.headers['user-agent'] || null
      }
    });

    // Usar contactEmail si existe, sino email institucional
    const recipientEmail = user.contactEmail || user.email;
    const userName = [user.firstName, user.lastNameP, user.lastNameM]
      .filter(Boolean)
      .join(' ') || user.name || 'Usuario';

    const resetLink = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    console.log(`📧 Enviando email de recuperación a: ${recipientEmail}`);
    console.log(`🔗 Link de recuperación: ${resetLink}`);

    await sendPasswordResetEmail({
      to: recipientEmail,
      name: userName,
      resetLink
    });

    // Registrar intento exitoso
    if (!entry) {
      forgotAttemptsMap.set(key, { first: now, count: 1 });
    } else {
      entry.count++;
    }

    return res.json({ ok: true, message: successMsg });
  } catch (e) {
    console.error('FORGOT PASSWORD ERROR:', e);
    return res.status(500).json({ error: 'Error al procesar solicitud' });
  }
});

/* ------------------------- RESET PASSWORD ---------------------------- */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token y contraseña requeridos' });
    }

    if (!RE_PASSWORD.test(newPassword)) {
      return res.status(400).json({
        error: 'La contraseña debe tener mínimo 12 caracteres, incluyendo mayúsculas, minúsculas, números y símbolos.'
      });
    }

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            isActive: true
          }
        }
      }
    });

    if (!resetRecord) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    if (resetRecord.usedAt) {
      return res.status(400).json({ error: 'Token ya utilizado' });
    }

    if (new Date() > resetRecord.expiresAt) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    if (!resetRecord.user.isActive) {
      return res.status(403).json({ error: 'Cuenta deshabilitada' });
    }

    // Actualizar contraseña
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: {
        password: hash,
        mustChangePassword: false
      }
    });

    // Marcar token como usado
    await prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() }
    });

    console.log(`✅ Contraseña restablecida para usuario ID: ${resetRecord.userId}`);

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (e) {
    console.error('RESET PASSWORD ERROR:', e);
    return res.status(500).json({ error: 'Error al restablecer contraseña' });
  }
});

/* ------------------------- CHANGE PASSWORD --------------------------- */
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
    }

    if (!RE_PASSWORD.test(newPassword)) {
      return res.status(400).json({
        error: 'La contraseña debe tener mínimo 12 caracteres, incluyendo mayúsculas, minúsculas, números y símbolos.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, password: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Usuario no válido' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        mustChangePassword: false
      }
    });

    console.log(`✅ Contraseña cambiada para usuario ID: ${user.id}`);

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (e) {
    console.error('CHANGE PASSWORD ERROR:', e);
    return res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});
