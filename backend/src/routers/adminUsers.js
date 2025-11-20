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

// helpers iguales a adminImport
function stripAccents(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function capitalize(str = '') {
  const s = stripAccents(String(str).trim().toLowerCase());
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1);
}

function buildDefaultPassword({ firstName, lastNameP, boleta }) {
  const fn = String(firstName || 'Usuario').trim().split(/\s+/)[0];
  const ln = String(lastNameP || 'ESCOM').trim().split(/\s+/)[0];
  const cleanFn = stripAccents(fn);
  const cleanLn = stripAccents(ln);

  const initial = cleanFn[0] ? cleanFn[0].toLowerCase() : 'u';
  const lastLower = cleanLn.toLowerCase();
  const digits = String(boleta || '').replace(/\D/g, '');
  const tail = digits.slice(-4) || '0000';
  const nameCap = capitalize(fn);

  let pwd = `${initial}${lastLower}${tail}${nameCap}.`;

  if (!RE_PASSWORD.test(pwd)) {
    pwd = pwd + '!2025aA1';
  }

  return pwd;
}

/** POST /api/admin/users  (solo ADMIN)  crea ADMIN/GUARD/USER */
router.post('/users', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    let {
      boleta, firstName, lastNameP, lastNameM,
      email, password,
      role = 'GUARD',
      institutionalType, // opcional
      overrideGuard
    } = req.body || {};
    overrideGuard = !!overrideGuard;

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
    if (exists) {
      if (exists.role === 'GUARD' && overrideGuard) {
        const name = buildFullName(firstName, lastNameP, lastNameM);
        const hash = await bcrypt.hash(password, 10);
        const updated = await prisma.user.update({
          where: { id: exists.id },
          data: {
            boleta, firstName, lastNameP, lastNameM,
            name, password: hash,
            institutionalType: null // guardias no llevan institutionalType
          },
          select: {
            id: true, name: true, email: true, role: true, boleta: true,
            institutionalType: true, isActive: true, createdAt: true
          }
        });
        return res.json({ ok: true, user: updated, updated: true });
      }
      return res.status(409).json({ error: 'El correo ya existe' });
    }

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
    const institutionalType = (req.query.institutionalType || '').trim().toUpperCase(); // ← NUEVO
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';

    // Construir filtro base
    const baseWhere = {};
    if (role && ['ADMIN', 'USER', 'GUARD'].includes(role)) {
      baseWhere.role = role;
    }
    if (!includeInactive) {
      baseWhere.isActive = true;
    }
    
    // ← NUEVO: Filtro por sub-rol institucional
    if (institutionalType && ['STUDENT', 'TEACHER', 'PAE'].includes(institutionalType)) {
      baseWhere.institutionalType = institutionalType;
    }

    let itemsRaw = [];
    let totalFiltered = 0;

    if (query) {
      const trimmed = query.trim();
      
      // Si son exactamente 10 dígitos, buscar boleta exacta
      if (/^\d{10}$/.test(trimmed)) {
        const where = { ...baseWhere, boleta: trimmed };
        
        [itemsRaw, totalFiltered] = await Promise.all([
          prisma.user.findMany({
            where,
            take,
            skip,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, boleta: true, firstName: true, lastNameP: true, lastNameM: true,
              name: true, email: true, role: true, isActive: true, mustChangePassword: true,
              institutionalType: true, createdAt: true,
            }
          }),
          prisma.user.count({ where })
        ]);
      }
      // Si parece un email completo (contiene @ y dominio ipn.mx), búsqueda exacta
      else if (/@.*ipn\.mx$/i.test(trimmed)) {
        const where = { 
          ...baseWhere, 
          email: { equals: trimmed.toLowerCase(), mode: 'insensitive' }
        };
        
        [itemsRaw, totalFiltered] = await Promise.all([
          prisma.user.findMany({
            where,
            take,
            skip,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, boleta: true, firstName: true, lastNameP: true, lastNameM: true,
              name: true, email: true, role: true, isActive: true, mustChangePassword: true,
              institutionalType: true, createdAt: true,
            }
          }),
          prisma.user.count({ where })
        ]);
      }
      // Para nombres: traer todos y filtrar en memoria (normalización de acentos)
      else {
        // Traer TODOS los usuarios que coincidan con el filtro base
        const allUsers = await prisma.user.findMany({
          where: baseWhere,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, boleta: true, firstName: true, lastNameP: true, lastNameM: true,
            name: true, email: true, role: true, isActive: true, mustChangePassword: true,
            institutionalType: true, createdAt: true,
          }
        });

        // Normalizar término de búsqueda
        const normalized = stripAccents(trimmed).toLowerCase();
        
        // Filtrar en memoria con normalización de acentos
        const filtered = allUsers.filter(u => {
          const nameNormalized = stripAccents(u.name || '').toLowerCase();
          const emailNormalized = (u.email || '').toLowerCase();
          const boletaNormalized = (u.boleta || '');
          
          return nameNormalized.includes(normalized) || 
                 emailNormalized.includes(normalized) ||
                 boletaNormalized.includes(trimmed);
        });

        // Aplicar paginación manual
        totalFiltered = filtered.length;
        itemsRaw = filtered.slice(skip, skip + take);
      }
    } else {
      // Sin búsqueda, traer todos según filtros base
      [itemsRaw, totalFiltered] = await Promise.all([
        prisma.user.findMany({
          where: baseWhere,
          take,
          skip,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, boleta: true, firstName: true, lastNameP: true, lastNameM: true,
            name: true, email: true, role: true, isActive: true, mustChangePassword: true,
            institutionalType: true, createdAt: true,
          }
        }),
        prisma.user.count({ where: baseWhere })
      ]);
    }

    // Mapear para agregar defaultPassword
    const items = itemsRaw.map((u) => {
      let defaultPassword = null;
      if (u.mustChangePassword && u.role === 'USER') {
        defaultPassword = buildDefaultPassword({
          firstName: u.firstName,
          lastNameP: u.lastNameP,
          boleta: u.boleta,
        });
      }

      return {
        ...u,
        defaultPassword,
      };
    });

    res.json({ items, total: totalFiltered });
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

/** DELETE /api/admin/users/:id (solo ADMIN)
 * Query: mode=soft|anonymize|hard
 *        anonymizeEmail=true (opcional para reemplazar email)
 */
router.delete('/users/:id', auth, requireRole(['ADMIN']), async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const { mode = 'soft' } = req.query;
  const anonymizeEmail = String(req.query.anonymizeEmail || 'true').toLowerCase() === 'true';

  try {
    const target = await prisma.user.findUnique({ where: { id: idNum } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Evita eliminarse a sí mismo
    if (target.id === req.user.id && mode !== 'soft') {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    // Proteger último ADMIN activo (para soft/anonymize/hard)
    if (target.role === 'ADMIN') {
      const adminsActivos = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, enabled: true, id: { not: target.id } }
      });
      if (adminsActivos === 0) {
        return res.status(400).json({ error: 'No puedes eliminar al último ADMIN activo' });
      }
    }

    if (mode === 'soft') {
      const updated = await prisma.user.update({
        where: { id: idNum },
        data: { enabled: false, isActive: false }
      });
      return res.json({ message: 'Usuario deshabilitado (soft delete)', userId: updated.id });
    }

    if (mode === 'anonymize') {
      const anonymizedEmail = anonymizeEmail
        ? `deleted_${target.id}_${Date.now()}@example.invalid`
        : target.email;
      const updated = await prisma.user.update({
        where: { id: idNum },
        data: {
          name: '[ELIMINADO]',
            firstName: null,
            lastNameP: null,
            lastNameM: null,
            email: anonymizedEmail,
            boleta: null,
            photoUrl: null,
            enabled: false,
            isActive: false
        }
      });
      return res.json({ message: 'Usuario anonimizado', userId: updated.id });
    }

    if (mode === 'hard') {
      await prisma.user.delete({ where: { id: idNum } });
      return res.json({
        message: 'Usuario eliminado (hard delete). Logs quedan con userId NULL.',
        userId: idNum
      });
    }

    return res.status(400).json({ error: 'mode inválido (soft|anonymize|hard)' });
   } catch (err) {
     return res.status(400).json({ error: 'No se pudo procesar', detail: err.message });
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

/** POST /api/admin/users/bulk-action
 * Body: { ids:number[], mode:'soft'|'anonymize'|'hard', anonymizeEmail?:boolean }
 */
router.post('/users/bulk-action', auth, requireRole(['ADMIN']), async (req, res) => {
  const { ids, mode = 'soft', anonymizeEmail = true } = req.body || {};
  const validModes = ['soft','anonymize','hard'];
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids vacío' });
  }
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: 'mode inválido' });
  }
  const uniqueIds = [...new Set(ids)].filter(n => Number.isInteger(n) && n > 0);
  if (!uniqueIds.length) return res.status(400).json({ error: 'ids inválidos' });

  try {
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id:true, role:true, isActive:true, enabled:true }
    });
    const map = new Map(users.map(u => [u.id, u]));

    // Pre-chequeo global para no dejar sin ADMIN activo
    if (['soft','anonymize','hard'].includes(mode)) {
      const totalActiveAdmins = await prisma.user.count({
        where: { role:'ADMIN', isActive:true, enabled:true }
      });
      const targetedActiveAdmins = users.filter(u => u.role==='ADMIN' && u.isActive && u.enabled).length;
      if (totalActiveAdmins - targetedActiveAdmins <= 0) {
        return res.status(400).json({ error: 'La acción dejaría sin ADMIN activo.' });
      }
    }

    const errors = [];
    let soft=0, anonymized=0, hard=0, processed=0;

    for (const id of uniqueIds) {
      const u = map.get(id);
      if (!u) { errors.push({ id, error:'No encontrado' }); continue; }
      try {
        if (mode === 'soft') {
          // protección último admin activo individual
          if (u.role==='ADMIN' && u.isActive) {
            const remaining = await prisma.user.count({
              where:{ role:'ADMIN', isActive:true, enabled:true, id:{ not: u.id } }
            });
            if (!remaining) { errors.push({ id, error:'Último ADMIN activo' }); continue; }
          }
          await prisma.user.update({ where:{ id:u.id }, data:{ isActive:false, enabled:false } });
          soft++; processed++;
        } else if (mode === 'anonymize') {
          if (u.role==='ADMIN' && u.isActive) {
            const remaining = await prisma.user.count({
              where:{ role:'ADMIN', isActive:true, enabled:true, id:{ not: u.id } }
            });
            if (!remaining) { errors.push({ id, error:'Último ADMIN activo' }); continue; }
          }
          const anonEmail = anonymizeEmail ? `deleted_${u.id}_${Date.now()}@example.invalid` : undefined;
          await prisma.user.update({
            where:{ id:u.id },
            data:{
              name:'[ELIMINADO]',
              firstName:null,lastNameP:null,lastNameM:null,
              boleta:null, photoUrl:null,
              email: anonEmail || undefined,
              isActive:false, enabled:false
            }
          });
          anonymized++; processed++;
        } else if (mode === 'hard') {
          if (u.role==='ADMIN' && u.isActive) {
            const remaining = await prisma.user.count({
              where:{ role:'ADMIN', isActive:true, enabled:true, id:{ not: u.id } }
            });
            if (!remaining) { errors.push({ id, error:'Último ADMIN activo' }); continue; }
          }
          await prisma.user.delete({ where:{ id:u.id } });
          hard++; processed++;
        }
      } catch (inner) {
        errors.push({ id, error: inner.message });
      }
    }

    return res.json({
      ok:true,
      summary:{
        requested: uniqueIds.length,
        processed, soft, anonymized, hard,
        errors
      }
    });
  } catch (e) {
    console.error('BULK ACTION ERROR', e);
    return res.status(500).json({ error:'Fallo interno' });
  }
});

module.exports = router;
