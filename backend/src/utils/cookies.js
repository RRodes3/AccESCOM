// backend/src/utils/cookies.js
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // true si usas HTTPS
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 // 1 día
};
module.exports = { cookieOptions };
