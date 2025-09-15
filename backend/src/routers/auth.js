const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');        // ajusta ruta si difiere
const { cookieOptions } = require('../utils/cookies');
const RE_LETTERS   = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;         // letras y espacios
const RE_BOLETA    = /^\d{10}$/;                             // exactamente 10 dígitos
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/; //contraseña fuerte
const RE_EMAIL_DOT     = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i; // email tipo "iniciales.apellido" o "rrodasr1800" + @ipn.mx/@alumno.ipn.mx
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;

const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email||'').trim()) || RE_EMAIL_COMPACT.test((email||'').trim());

const sanitizeName = (s) =>
  String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);

const buildFullName = (firstName, lastNameP, lastNameM) => {
  const parts = [firstName, lastNameP, lastNameM].map(sanitizeName).filter(Boolean);
  return (parts.join(' ') || 'Usuario').slice(0, 120);
};


const prisma = new PrismaClient();

/* ---------- REGISTER ---------- */
router.post('/register', async (req, res) => {
  try {
    // 1) Extrae y normaliza entradas
    let {
      boleta, firstName, lastNameP, lastNameM,
      name, email, password /*, role (IGNORADO) */
    } = req.body || {};

    boleta     = (boleta || '').trim();
    firstName  = sanitizeName(firstName);
    lastNameP  = sanitizeName(lastNameP);
    lastNameM  = sanitizeName(lastNameM);
    email      = String(email || '').trim().toLowerCase();
    password   = String(password || '');

    // 2) Valida campos (acumula errores para feedback de UI)
    const errors = {};
    if (!RE_BOLETA.test(boleta)) errors.boleta = 'La boleta debe tener exactamente 10 dígitos.';
    if (!firstName)              errors.firstName = 'El nombre es obligatorio.';
    else if (!RE_LETTERS.test(firstName)) errors.firstName = 'Usa solo letras y espacios.';
    if (!lastNameP)              errors.lastNameP = 'El apellido paterno es obligatorio.';
    else if (!RE_LETTERS.test(lastNameP)) errors.lastNameP = 'Usa solo letras y espacios.';
    if (!lastNameM)              errors.lastNameM = 'El apellido materno es obligatorio.';
    else if (!RE_LETTERS.test(lastNameM)) errors.lastNameM = 'Usa solo letras y espacios.';
    if (!email)                  errors.email = 'El correo es obligatorio.';
    else if (!isInstitutional(email)) errors.email = 'Usa tu correo institucional (@ipn.mx o @alumno.ipn.mx).';
    if (!RE_PASSWORD.test(password)) errors.password = 'Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.';

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validación fallida', errors });
    }

    // 3) Unicidad de email
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Este correo ya está registrado.' });

    // 4) Construye nombre completo (ignora "name" de entrada si vino vacío)
    const fullName = name?.trim() ? sanitizeName(name) : buildFullName(firstName, lastNameP, lastNameM);

    // 5) Hash de contraseña
    const hash = await bcrypt.hash(password, 10);

    // 6) Crea usuario (FORZAR role = 'USER' por seguridad)
    const created = await prisma.user.create({
      data: {
        boleta,
        firstName,
        lastNameP,
        lastNameM,
        name: fullName,
        email,
        password: hash,
        role: 'USER',
      },
      select: { id:true, name:true, email:true, role:true, boleta:true, firstName:true, lastNameP:true, lastNameM:true }
    });

    return res.json({ ok:true, user: created });
  } catch (e) {
    console.error('REGISTER ERROR:', e);
    return res.status(500).json({ error:'No se pudo registrar' });
  }
});


// ====== LOGIN con Super Admin ======
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Faltan credenciales' });

    const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase();
    const superPass  = String(process.env.SUPER_ADMIN_PASSWORD || '');

    if (superEmail && email.toLowerCase() === superEmail) {
      // compara contra el .env
      if (password !== superPass) return res.status(401).json({ error: 'Credenciales inválidas' });

      // upsert del super admin en BD para tener id/relaciones
      const superUser = await prisma.user.upsert({
        where: { email: superEmail },
        update: { role: 'ADMIN' },
        create: {
          boleta: '0000000000',
          firstName: 'Super',
          lastNameP: 'Admin',
          lastNameM: 'IPN',
          name: 'Super Admin',
          email: superEmail,
          password: await bcrypt.hash(superPass, 10),
          role: 'ADMIN'
        },
        select: { id:true, name:true, email:true, role:true, boleta:true }
      });

      const payload = { id: superUser.id, role: superUser.role, email: superUser.email, name: superUser.name };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
      const body = { user: payload };
      if (process.env.NODE_ENV !== 'production') body.token = token;
      return res.cookie('token', token, cookieOptions).json(body);
    }

    // flujo normal (no super admin)
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const payload = { id: user.id, role: user.role, email: user.email, name: user.name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
    const body = { user: payload };
    if (process.env.NODE_ENV !== 'production') body.token = token;
    return res.cookie('token', token, cookieOptions).json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en login' });
  }
});


/* ---------- LOGOUT ---------- */
router.post('/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: 0 }).json({ ok: true });
});

/* ---------- ME ---------- */
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
