// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
    };

    return next();
  } catch (e) {
    console.error('AUTH MIDDLEWARE ERROR:', e);
    return res.status(401).json({ error: 'No autenticado' });
  }
};
