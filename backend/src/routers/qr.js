// backend/src/routers/qr.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const KINDS = new Set(['ENTRY', 'EXIT']);
const isValidKind = (k) => typeof k === 'string' && KINDS.has(k);

// Duración del QR en minutos (configurable vía .env)
const prisma = new PrismaClient();
const TTL_MINUTES = Math.max(
  1,
  parseInt(process.env.QR_TTL_MINUTES || '5', 10) // 5 min pruebas; en prod 10080
);

// Utils
const now = () => new Date();
const addMinutes = (d, m) => new Date(d.getTime() + m * 60 * 1000);
const isExpired = (pass) => pass.expiresAt && pass.expiresAt <= now();

/**
 * Emite o reutiliza el QR activo por tipo (idempotente)
 */
async function ensureActivePass(userId, kind, ttlMinutes = TTL_MINUTES) {
  // 1) ¿hay activo vigente?
  let pass = await prisma.qRPass.findFirst({
    where: {
      userId,
      kind,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (pass) return pass;

  // 2) Si hay activo pero vencido, márcalo EXPIRED (por si quedó colgado)
  const last = await prisma.qRPass.findFirst({
    where: { userId, kind, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (last) {
    await prisma.qRPass.update({
      where: { id: last.id },
      data: { status: 'EXPIRED' },
    });
  }

  // 3) Crea uno nuevo
  const code = crypto.randomBytes(16).toString('hex');
  const expiresAt = addMinutes(now(), ttlMinutes);

  pass = await prisma.qRPass.create({
    data: { code, userId, kind, expiresAt, status: 'ACTIVE' },
    select: { id: true, code: true, kind: true, status: true, expiresAt: true, createdAt: true },
  });

  await prisma.accessLog.create({
    data: { userId, qrId: pass.id, kind, action: 'ISSUE' },
  });

  return pass;
}

/**
 * POST /api/qr/issue   (USER/ADMIN)
 * body: { kind: 'ENTRY'|'EXIT' }
 * Idempotente por (user, kind)
 */
router.post('/issue', auth, requireRole(['USER','ADMIN']), async (req, res) => {
  try {
    const kind = String(req.body?.kind || '').toUpperCase();
    if (!isValidKind(kind)) return res.status(400).json({ error: 'Kind inválido' });

    // TTL por env (p.ej. 5 minutos para pruebas)
    const ttlMin = Math.max(1, Number(process.env.QR_TTL_MINUTES || 5));
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

    // ¿ya hay uno activo de ese tipo?
    const existing = await prisma.qRPass.findFirst({
      where: {
        userId: req.user.id,
        kind,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return res.json({ pass: {
        id: existing.id, code: existing.code, status: existing.status,
        kind: existing.kind, expiresAt: existing.expiresAt, createdAt: existing.createdAt
      }});
    }

    // crear nuevo (y revocar si hubiera alguno ACTIVE viejo, por higiene)
    await prisma.qRPass.updateMany({
      where: { userId: req.user.id, kind, status: 'ACTIVE' },
      data:  { status: 'REVOKED' }
    });

    const code = crypto.randomBytes(16).toString('hex');
    const pass = await prisma.qRPass.create({
      data: { code, userId: req.user.id, kind, expiresAt },
      select: { id:true, code:true, status:true, kind:true, expiresAt:true, createdAt:true }
    });

    await prisma.accessLog.create({
      data: { userId: req.user.id, qrId: pass.id, action: 'ISSUE', kind }
    });

    res.json({ pass });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo emitir el QR' });
  }
});

/**
 * GET /api/qr/my-active?kind=ENTRY&autocreate=1
 * Si autocreate=1, asegura tener uno activo (idempotente)
 */
router.get('/my-active', auth, requireRole(['USER','ADMIN']), async (req, res) => {
  try {
    const kind = String(req.query?.kind || '').toUpperCase();
    if (!isValidKind(kind)) {
      return res.status(400).json({ error: 'Kind inválido' });
    }

    // Estado actual del usuario (por UX bloqueamos mostrar el QR “equivocado”)
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { accessState: true }
    });
    const accessState = u?.accessState || 'OUTSIDE';

    if (accessState === 'INSIDE' && kind === 'ENTRY') {
      return res.status(409).json({ error: 'Tu QR de entrada está deshabilitado. Debes salir primero.' });
    }
    if (accessState === 'OUTSIDE' && kind === 'EXIT') {
      return res.status(409).json({ error: 'Tu QR de salida está deshabilitado. Debes entrar primero.' });
    }

    const autocreate = String(req.query?.autocreate || '') === '1';

    // Buscar activo vigente de ese tipo
    let pass = await prisma.qRPass.findFirst({
      where: {
        userId: req.user.id,
        kind,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id:true, code:true, status:true, kind:true, expiresAt:true, createdAt:true }
    });

    // Si no hay y autocreate=1, crear uno nuevo (rotando cualquier ACTIVE “viejo”)
    if (!pass && autocreate) {
      const ttlMin = Math.max(1, Number(process.env.QR_TTL_MINUTES || 5));
      const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

      await prisma.qRPass.updateMany({
        where: { userId: req.user.id, kind, status: 'ACTIVE' },
        data:  { status: 'REVOKED' }
      });

      const code = crypto.randomBytes(16).toString('hex');
      pass = await prisma.qRPass.create({
        data: { code, userId: req.user.id, kind, expiresAt, status: 'ACTIVE' },
        select: { id:true, code:true, status:true, kind:true, expiresAt:true, createdAt:true }
      });

      await prisma.accessLog.create({
        data: { userId: req.user.id, qrId: pass.id, action: 'ISSUE', kind }
      });
    }

    return res.json({ pass: pass || null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No se pudo consultar el QR activo' });
  }
});

/**
 * POST /api/qr/validate   (GUARD/ADMIN)
 * body: { code }
 * (Opcional) coherencia con estado de acceso del usuario
 */
router.post('/validate', auth, requireRole(['GUARD', 'ADMIN']), async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || code.length < 16) {
      return res.status(400).json({ ok:false, reason:'code inválido' });
    }
    const pass = await prisma.qRPass.findUnique({
      where: { code },
      include: { user: true, guest: true }
    });
    if (!pass) return res.status(404).json({ ok:false, reason:'QR no encontrado' });

    // expiración
    if (pass.expiresAt && pass.expiresAt <= new Date()) {
      await prisma.qRPass.update({ where: { id: pass.id }, data: { status: 'EXPIRED' } });
      await prisma.accessLog.create({
        data: {
          userId:  pass.userId || null,
          guestId: pass.guestId || null,
          kind:    pass.kind,
          action:  'VALIDATE_DENY',
          guardId: req.user.id
        }
      });
      return res.status(400).json({ ok:false, reason:'QR expirado' });
    }

    // CASE A) QR de USUARIO (reutilizable, NO marcar USED)
    if (pass.userId) {
      const u = pass.user; // traído por include
      // coherencia adentro/afuera (como ya tienes)
      if (pass.kind === 'ENTRY' && u.accessState === 'INSIDE')
        return res.status(400).json({ ok:false, reason:'Usuario ya está dentro.' });
      if (pass.kind === 'EXIT' && u.accessState === 'OUTSIDE')
        return res.status(400).json({ ok:false, reason:'Usuario ya está fuera.' });

      await prisma.user.update({
        where: { id: u.id },
        data: { accessState: u.accessState === 'OUTSIDE' ? 'INSIDE' : 'OUTSIDE' }
      });
      await prisma.accessLog.create({
        data: { userId: u.id, kind: pass.kind, action: 'VALIDATE_ALLOW', guardId: req.user.id }
      });

      const owner = {
        id: u.id, role: u.role, name: u.name, boleta: u.boleta,
        firstName: u.firstName, lastNameP: u.lastNameP, lastNameM: u.lastNameM, email: u.email
      };
      return res.json({ ok:true, owner, pass: { kind: pass.kind } });
    }

    // CASE B) QR de INVITADO (UN SOLO USO → marcar USED)
    if (pass.guestId) {
      const g = pass.guest;

      // coherencia simple con estado de visita
      if (pass.kind === 'ENTRY' && g.state === 'INSIDE')
        return res.status(400).json({ ok:false, reason:'Invitado ya está dentro.' });
      if (pass.kind === 'EXIT'  && g.state === 'OUTSIDE')
        return res.status(400).json({ ok:false, reason:'Invitado aún no ha entrado.' });

      // un solo uso:
      await prisma.qRPass.update({ where: { id: pass.id }, data: { status: 'USED' } });

      // transición de estado de la visita
      await prisma.guestVisit.update({
        where: { id: g.id },
        data: { state: pass.kind === 'ENTRY' ? 'INSIDE' : 'COMPLETED' }
      });

      await prisma.accessLog.create({
        data: { guestId: g.id, kind: pass.kind, action: 'VALIDATE_ALLOW', guardId: req.user.id }
      });

      const owner = {
        role: 'GUEST',
        name: `${g.firstName} ${g.lastNameP} ${g.lastNameM || ''}`.trim(),
        firstName: g.firstName, lastNameP: g.lastNameP, lastNameM: g.lastNameM, curp: g.curp, reason: g.reason
      };
      return res.json({ ok:true, owner, pass: { kind: pass.kind } });
    }

    return res.status(400).json({ ok:false, reason:'QR inválido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, reason: 'Error validando' });
  }
});

// POST /api/qr/ensure-both  (USER/ADMIN)
// Crea (si faltan) los QR ENTRY y EXIT con el MISMO expiresAt.
// POST /api/qr/ensure-both  (USER/ADMIN)
// Si faltan, crea ENTRY y/o EXIT con el MISMO expiresAt; si ya existen, los reutiliza.
router.post('/ensure-both', auth, requireRole(['USER','ADMIN']), async (req, res) => {
  try {
    const ttlMin = Math.max(1, Number(process.env.QR_TTL_MINUTES || 5));
    const fixedExpiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // 1) Leer los activos vigentes
      const [entryActive, exitActive] = await Promise.all([
        tx.qRPass.findFirst({
          where: {
            userId: req.user.id, kind: 'ENTRY', status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
        }),
        tx.qRPass.findFirst({
          where: {
            userId: req.user.id, kind: 'EXIT', status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      let entry = entryActive;
      let exit  = exitActive;

      // helper para crear con expiresAt fijo
      const createWithFixed = (kind) =>
        tx.qRPass.create({
          data: {
            code: require('crypto').randomBytes(16).toString('hex'),
            userId: req.user.id,
            kind,
            status: 'ACTIVE',
            expiresAt: fixedExpiresAt,
          },
          select: { id:true, code:true, kind:true, status:true, expiresAt:true, createdAt:true },
        });

      // 2) Para cada tipo que falte, revocar “ACTIVE” viejos y crear nuevo con el mismo expiresAt
      if (!entry) {
        await tx.qRPass.updateMany({
          where: { userId: req.user.id, kind: 'ENTRY', status: 'ACTIVE' },
          data:  { status: 'REVOKED' },
        });
        entry = await createWithFixed('ENTRY');
        await tx.accessLog.create({ data: { userId: req.user.id, qrId: entry.id, kind: 'ENTRY', action: 'ISSUE' } });
      }

      if (!exit) {
        await tx.qRPass.updateMany({
          where: { userId: req.user.id, kind: 'EXIT', status: 'ACTIVE' },
          data:  { status: 'REVOKED' },
        });
        exit = await createWithFixed('EXIT');
        await tx.accessLog.create({ data: { userId: req.user.id, qrId: exit.id, kind: 'EXIT', action: 'ISSUE' } });
      }

      return { entry, exit };
    });

    res.json({ ok: true, entry: result.entry, exit: result.exit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudieron asegurar los QR' });
  }
});


/**
 * C) GET /api/qr/logs?take=50&skip=0  (ADMIN)
 */
router.get('/logs', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const take = Math.min(parseInt(req.query.take || '50', 10), 200);
    const skip = parseInt(req.query.skip || '0', 10);
    const [items, total] = await Promise.all([
      prisma.accessLog.findMany({
        take, skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user:  { select: { name: true, email: true, boleta: true } },
          guard: { select: { name: true, email: true } },
          qr:    { select: { code: true, kind: true } }
        }
      }),
      prisma.accessLog.count()
    ]);
    res.json({ items, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudieron obtener los logs' });
  }
});

/**
 * D) GET /api/qr/stats  (ADMIN)
 */
router.get('/stats', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const [users, passes, logs, allowed, denied] = await Promise.all([
      prisma.user.count(),
      prisma.qRPass.count(),
      prisma.accessLog.count(),
      prisma.accessLog.count({ where: { action: 'VALIDATE_ALLOW' } }),
      prisma.accessLog.count({ where: { action: 'VALIDATE_DENY' } }),
    ]);
    res.json({ users, passes, logs, allowed, denied });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudieron calcular estadísticas' });
  }
});
/*
********************************************
// backend/src/routers/qr.js (solo pruebas!)
********************************************
*/
router.post('/reset-state', auth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { accessState: 'OUTSIDE' }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo resetear el estado' });
  }
});

module.exports = router;
