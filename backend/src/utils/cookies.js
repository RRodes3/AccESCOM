// backend/src/utils/cookies.js
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 1000 * 60 * 60 * 24,
  domain: isProd ? process.env.COOKIE_DOMAIN : undefined, // ✅ NUEVO
  path: '/', // ✅ NUEVO
};

module.exports = { cookieOptions };
