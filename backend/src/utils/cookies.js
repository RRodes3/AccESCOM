// backend/src/utils/cookies.js
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax', // para poder usarla en cross-site
  maxAge: 1000 * 60 * 60 * 24,       // 1 día
  // domain: undefined,
  path: '/',
};

module.exports = { cookieOptions };
