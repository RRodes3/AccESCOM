// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
  const header = req.header('Authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = req.cookies?.token || bearer;

  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET); // {id, role, email, name}
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};
