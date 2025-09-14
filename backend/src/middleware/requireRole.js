module.exports = (roles = []) => (req, res, next) => {
  roles = Array.isArray(roles) ? roles : [roles];
  if (!req.user) return res.status(401).json({ error: 'No autorizado' });
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
};