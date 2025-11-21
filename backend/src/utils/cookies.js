// backend/src/utils/cookies.js
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProd,                                    // en Railway: true (HTTPS)
  sameSite: isProd ? 'none' : 'lax',                // 👈 CLAVE para Vercel + Railway
  maxAge: 1000 * 60 * 60 * 24,                      // 1 día
};

module.exports = { cookieOptions };
