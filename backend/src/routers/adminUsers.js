const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const prisma = new PrismaClient();

// Reusa validadores
const RE_LETTERS   = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA    = /^\d{10}$/;
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_DOT     = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email||'').trim()) || RE_EMAIL_COMPACT.test((email||'').trim());

const sanitizeName = (s) =>
  String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);

const buildFullName = (firstName, lastNameP, lastNameM) => {
  const parts = [firstName, lastNameP, lastNameM].map(sanitizeName).filter(Boolean);
  return (parts.join(' ') || 'Usuario').slice(0, 120);
};

// POST /api/admin/users  (solo ADMIN)  crea GUARD/ADMIN/USER
router.post('/users', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    let { boleta, firstName, lastNameP, lastNameM, email, password, role = 'GUARD' } = req.body || {};
    boleta     = (boleta || '').trim();
    firstName  = sanitizeName(firstName);
    lastNameP  = sanitizeName(lastNameP);
    lastNameM  = sanitizeName(lastNameM);
    email      = String(email || '').trim().toLowerCase();
    password   = String(password || '');
    role       = ['ADMIN','GUARD','USER'].includes(role) ? role : 'GUARD';

    const errors = {};
    if (!RE_BOLETA.test(boleta)) errors.boleta = 'La boleta debe tener exactamente 10 dígitos.';
    if (!firstName || !RE_LETTERS.test(firstName)) errors.firstName = 'Nombre inválido.';
    if (!lastNameP || !RE_LETTERS.test(lastNameP)) errors.lastNameP = 'Apellido paterno inválido.';
    if (!lastNameM || !RE_LETTERS.test(lastNameM)) errors.lastNameM = 'Apellido materno inválido.';
    if (!email || !isInstitutional(email)) errors.email = 'Correo institucional inválido.';
    if (!RE_PASSWORD.test(password)) errors.password = 'Contraseña débil (12+ con may/mín/número/símbolo).';

    if (Object.keys(errors).length) return res.status(400).json({ error: 'Validación fallida', errors });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'El correo ya existe' });

    const name = buildFullName(firstName, lastNameP, lastNameM);
    const hash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: { boleta, firstName, lastNameP, lastNameM, name, email, password: hash, role },
      select: { id:true, name:true, email:true, role:true, boleta:true }
    });

    res.json({ ok:true, user: created });
  } catch (e) {
    console.error('ADMIN CREATE USER ERROR:', e);
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});

module.exports = router;
