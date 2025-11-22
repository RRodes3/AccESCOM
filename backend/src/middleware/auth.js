// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

if (process.env.NODE_ENV !== 'production') {
  console.log('[AUTH] Inactividad configurada en', IDLE_MINUTES, 'minutos');
}

function cookieClearOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

// 🔹 Middleware de autenticación únicamente
async function auth(req, res, next) {
  try {
    const token =
      req.cookies?.token ||
      req.header('Authorization')?.replace('Bearer ', '');

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
      return res.status(403).json({
        error: 'Tu cuenta ha sido deshabilitada. Contacta al administrador.',
      });
    }

    // ⏱️ Check de inactividad
    const now = Date.now();
    if (user.lastActivityAt) {
      let diffMin =
        (now - new Date(user.lastActivityAt).getTime()) / 60000;
      if (diffMin < 0) diffMin = 0;

      if (diffMin > IDLE_MINUTES && diffMin > 0.1) {
        res.clearCookie('token', cookieClearOpts());
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            `[AUTH] Expirando por inactividad. diffMin=${diffMin.toFixed(
              2
            )} limite=${IDLE_MINUTES}`
          );
        }
        return res
          .status(401)
          .json({ error: 'Sesión expirada por inactividad' });
      }
    }

    // Actualizar última actividad (sin bloquear si falla)
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastActivityAt: new Date() },
      })
      .catch((e) =>
        console.error('Error actualizando lastActivityAt:', e)
      );

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
      contactEmail: user.contactEmail,
    };

    return next();
  } catch (e) {
    console.error('AUTH MIDDLEWARE ERROR:', e);
    return res.status(401).json({ error: 'No autenticado' });
  }
}

module.exports = auth;
