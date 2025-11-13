// backend/src/routers/adminUsers.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const PDFDocument = require('pdfkit');

const prisma = new PrismaClient();

// Reusa validadores (FIX: faltaba "=" en varias constantes)
const RE_LETTERS        = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA         = /^\d{10}$/;
const RE_PASSWORD       = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_DOT      = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT  = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;

const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email || '').trim()) || RE_EMAIL_COMPACT.test((email || '').trim());

const sanitizeName = (s) =>
  String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);

const buildFullName = (firstName, lastNameP, lastNameM) => {
  const parts = [firstName, lastNameP, lastNameM].map(sanitizeName).filter(Boolean);
  return (parts.join(' ') || 'Usuario').slice(0, 120);
};

// Para el sub-rol institucional (si lo envían)
const INSTITUTIONAL_TYPES = ['STUDENT', 'TEACHER', 'PAE'];

/** POST /api/admin/users  (solo ADMIN)  crea ADMIN/GUARD/USER */
router.post('/users', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    let {
      boleta, firstName, lastNameP, lastNameM,
      email, password,
      role = 'GUARD',
      institutionalType // opcional: STUDENT | TEACHER | PAE (solo si role = USER)
    } = req.body || {};

    boleta     = (boleta || '').trim();
    firstName  = sanitizeName(firstName);
    lastNameP  = sanitizeName(lastNameP);
    lastNameM  = sanitizeName(lastNameM);
    email      = String(email || '').trim().toLowerCase();
    password   = String(password || '');
    role       = ['ADMIN', 'GUARD', 'USER'].includes(role) ? role : 'GUARD';

    const errors = {};
    if (!RE_BOLETA.test(boleta)) errors.boleta = 'La boleta debe tener exactamente 10 dígitos.';
    if (!firstName || !RE_LETTERS.test(firstName)) errors.firstName = 'Nombre inválido.';
    if (!lastNameP || !RE_LETTERS.test(lastNameP)) errors.lastNameP = 'Apellido paterno inválido.';
    if (!lastNameM || !RE_LETTERS.test(lastNameM)) errors.lastNameM = 'Apellido materno inválido.';
    if (!email || !isInstitutional(email)) errors.email = 'Correo institucional inválido.';
    if (!RE_PASSWORD.test(password)) errors.password = 'Contraseña débil (12+ con may/mín/número/símbolo).';

    // Valida institutionalType solo si llega y solo para role=USER
    if (institutionalType && role === 'USER' && !INSTITUTIONAL_TYPES.includes(String(institutionalType))) {
      errors.institutionalType = 'institutionalType inválido (STUDENT|TEACHER|PAE)';
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validación fallida', errors });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'El correo ya existe' });

    const name = buildFullName(firstName, lastNameP, lastNameM);
    const hash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        boleta, firstName, lastNameP, lastNameM,
        name, email, password: hash, role,
        institutionalType: role === 'USER' ? (institutionalType || null) : null
      },
      select: {
        id: true, name: true, email: true, role: true, boleta: true,
        institutionalType: true, isActive: true, createdAt: true
      }
    });

    res.json({ ok: true, user: created });
  } catch (e) {
    console.error('ADMIN CREATE USER ERROR:', e);
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});

/** GET /api/admin/users (solo ADMIN) */
router.get('/users', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const take = Math.min(parseInt(req.query.take || '20', 10), 100);
    const skip = parseInt(req.query.skip || '0', 10);
    const query = (req.query.query || '').trim();
    const role  = (req.query.role || '').trim().toUpperCase();
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';

    const where = {};
    if (query) {
      where.OR = [
        { name:   { contains: query, mode: 'insensitive' } },
        { email:  { contains: query, mode: 'insensitive' } },
        { boleta: { contains: query } }
      ];
    }
    if (role && ['ADMIN', 'USER', 'GUARD'].includes(role)) {
      where.role = role;
    }
    if (!includeInactive) {
      where.isActive = true;
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          boleta: true,
          name: true,
          email: true,
          role: true,
          institutionalType: true,
          isActive: true,
          createdAt: true
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({ items, total });
  } catch (e) {
    console.error('ADMIN LIST USERS ERROR:', e);
    res.status(500).json({ error: 'No se pudo obtener la lista' });
  }
});

/** GET /api/admin/guests (solo ADMIN) */
router.get('/guests', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const take = Math.min(parseInt(req.query.take || '50', 10), 200);
    const skip = parseInt(req.query.skip || '0', 10);

    const [items, total] = await Promise.all([
      prisma.guestVisit.findMany({
        orderBy: { createdAt: 'desc' },
        take, skip,
        select: {
          id: true, firstName: true, lastNameP: true, lastNameM: true,
          curp: true, reason: true, state: true, createdAt: true, expiresAt: true,
        }
      }),
      prisma.guestVisit.count()
    ]);

    res.json({ items, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo obtener invitados' });
  }
});

/** PATCH /api/admin/users/:id/deactivate (solo ADMIN) */
router.patch('/users/:id/deactivate', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });
    }

    if (target.role === 'ADMIN' && target.isActive) {
      const adminsActivos = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true }
      });
      if (adminsActivos <= 1) {
        return res.status(400).json({ error: 'No puedes desactivar al último ADMIN activo' });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ ok: true, user: { id: updated.id, isActive: updated.isActive } });
  } catch (e) {
    console.error('ADMIN DEACTIVATE USER ERROR:', e);
    res.status(500).json({ error: 'No se pudo desactivar' });
  }
});

/** PATCH /api/admin/users/:id/restore (solo ADMIN) */
router.patch('/users/:id/restore', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: true }
    });

    res.json({ ok: true, user: { id: updated.id, isActive: updated.isActive } });
  } catch (e) {
    console.error('ADMIN RESTORE USER ERROR:', e);
    res.status(500).json({ error: 'No se pudo reactivar' });
  }
});

/** DELETE /api/admin/users/:id (solo ADMIN) */
router.delete('/users/:id', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (target.role === 'ADMIN' && target.isActive) {
      const adminsActivos = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true }
      });
      if (adminsActivos <= 1) {
        return res.status(400).json({ error: 'No puedes eliminar al último ADMIN activo' });
      }
    }

    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('ADMIN DELETE USER ERROR:', e);
    res.status(400).json({ error: 'No se pudo eliminar. Si tiene QR o logs, realiza baja lógica.' });
  }
});

/**
 * GET /api/admin/report
 * Query params opcionales: from, to, subjectType, institutionalType, accessType, result
 */
router.get('/report', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const subjectType = req.query.subjectType || '';      // INSTITUTIONAL | GUEST
    const institutionalType = req.query.institutionalType || ''; // STUDENT|TEACHER|PAE
    const accessType = req.query.accessType || '';        // ENTRY | EXIT
    const result = req.query.result || '';                // ALLOWED | DENIED

    const where = {};

    // Rango de fechas
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) {
        // incluir el final del día (23:59:59.999)
        where.createdAt.lte = new Date(
          to.getTime() + (24 * 60 * 60 * 1000 - 1)
        );
      }
    }

    // Sujeto: institucional vs invitado
    if (subjectType === 'INSTITUTIONAL') {
      where.userId = { not: null };
    } else if (subjectType === 'GUEST') {
      where.guestId = { not: null };
    }

    // Tipo institucional (sub-rol del usuario)
    if (institutionalType) {
      // filtro sobre la relación user
      where.user = {
        is: { institutionalType },
      };
    }

    // Tipo de acceso (entrada/salida)
    if (accessType === 'ENTRY' || accessType === 'EXIT') {
      where.kind = accessType;
    }

    // Resultado: ALLOWED / DENIED / EXPIRED_QR / INVALID_QR
    if (result === 'ALLOWED') {
      where.action = 'VALIDATE_ALLOW';
    } else if (result === 'DENIED') {
      where.action = 'VALIDATE_DENY';
    } else if (result === 'EXPIRED_QR') {
      // Denegado específicamente por expiración
      where.action = 'VALIDATE_DENY';
      where.reason = 'QR expirado';
    } else if (result === 'INVALID_QR') {
      // Cualquier otro motivo de denegación que NO sea expirado
      where.action = 'VALIDATE_DENY';
      where.reason = { not: 'QR expirado' };
    }

    const rows = await prisma.accessLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastNameP: true,
            lastNameM: true,
            boleta: true,
            email: true,
            role: true,
            institutionalType: true,
          },
        },
        guest: {
          select: {
            id: true,
            firstName: true,
            lastNameP: true,
            lastNameM: true,
            curp: true,
            reason: true,
          },
        },
        guard: {
          select: {
            id: true,
            name: true,
          },
        },
        qr: {
          select: {
            id: true,
            kind: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    return res.json({ items: rows, total: rows.length });
  } catch (err) {
    console.error('ADMIN /report error:', err);
    return res.status(500).json({ error: 'No se pudo obtener el reporte' });
  }
});

module.exports = router;
