// backend/src/routers/qr.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { sendAccessNotificationEmail } = require('../utils/mailer');

const prisma = new PrismaClient();

// Helper para registrar intentos de validación por usuario institucional
function recordAttempt(pass, status, reason) {
  try {
    if (!pass?.userId) return;
    const delegate = prisma.qRAttempt;
    if (!delegate || typeof delegate.create !== 'function') {
      console.warn('[QRAttempt] Delegate missing; skipping attempt log');
      return;
    }
    return delegate.create({
      data: {
        userId: pass.userId,
        status: String(status),
        reason: (reason ?? '').toString().slice(0, 160),
      },
    }).catch(e => console.error('QRAttempt create error:', e));
  } catch (e) {
    console.error('recordAttempt skipped:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers de tiempo
// ─────────────────────────────────────────────────────────────
function getNextSundayCutoff(baseDate = new Date()) {
  const now = new Date(baseDate);
  const expiry = new Date(now);
  const day = expiry.getDay(); // 0 domingo, 1 lunes, ...

  const daysUntilSunday = (7 - day) % 7;
  expiry.setDate(expiry.getDate() + daysUntilSunday);
  expiry.setHours(23, 0, 0, 0); // 23:00

  // Si ya pasamos el domingo 23:00 de esta semana → siguiente
  if (expiry <= now) {
    expiry.setDate(expiry.getDate() + 7);
  }

  return expiry;
}

function computeExpiresAtWithSundayCap(ttlMinutes) {
  const now = new Date();
  const base = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const cap = getNextSundayCutoff(now);
  return base > cap ? cap : base;
}

// ─────────────────────────────────────────────────────────────
// Helper para logs (AccessLog)
// OJO: AccessLog NO tiene columnas userId/guestId/guardId/qrId ni reason.
// Solo relaciones: user, guest, guard, qr + campos kind/action/createdAt.
// ─────────────────────────────────────────────────────────────
async function createAccessLog({
  kind,
  action,
  userId,
  guestId,
  qrId,
  guardId,
}) {
  const data = { kind, action };

  if (userId) {
    data.user = { connect: { id: userId } };
  }
  if (guestId) {
    data.guest = { connect: { id: guestId } };
  }
  if (qrId) {
    data.qr = { connect: { id: qrId } };
  }
  if (guardId) {
    data.guard = { connect: { id: guardId } };
  }

  return prisma.accessLog.create({ data });
}

// ─────────────────────────────────────────────────────────────
// Helper para “dueño” del QR
// ─────────────────────────────────────────────────────────────
function buildOwner(pass) {
  if (!pass) return null;

  if (pass.user) {
    const u = pass.user;
    return {
      kind: 'INSTITUTIONAL',
      role: u.role,
      id: u.id,
      name:
        u.name ||
        [u.firstName, u.lastNameP, u.lastNameM].filter(Boolean).join(' '),
      firstName: u.firstName,
      lastNameP: u.lastNameP,
      lastNameM: u.lastNameM,
      boleta: u.boleta,
      email: u.email,
      institutionalType: u.institutionalType || null,
      photoUrl: u.photoUrl || null,
    };
  }

  if (pass.guest) {
    const g = pass.guest;
    return {
      kind: 'GUEST',
      role: 'GUEST',
      id: g.id,
      name: [g.firstName, g.lastNameP, g.lastNameM].filter(Boolean).join(' '),
      firstName: g.firstName,
      lastNameP: g.lastNameP,
      lastNameM: g.lastNameM,
      curp: g.curp || null,
      reason: g.reason || null,
    };
  }

  return null;
}

// Helper para validar el tipo de QR
function isValidKind(kind) {
  if (typeof kind !== 'string') return false;
  const k = kind.trim().toUpperCase();
  const extra = (process.env.QR_EXTRA_KINDS || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  const validKinds = new Set(['ENTRY', 'EXIT', ...extra]);
  return validKinds.has(k);
}

// ─────────────────────────────────────────────────────────────
// POST /api/qr/issue   (USER/ADMIN)
// ─────────────────────────────────────────────────────────────
router.post(
  '/issue',
  auth,
  requireRole(['USER', 'ADMIN']),
  async (req, res) => {
    try {
      const kind = String(req.body?.kind || '').toUpperCase();
      if (!isValidKind(kind)) {
        return res.status(400).json({ error: 'Kind inválido' });
      }

      const ttlMin = Math.max(
        1,
        Number(process.env.QR_TTL_MINUTES || 10080)
      );
      const expiresAt = computeExpiresAtWithSundayCap(ttlMin);

      // ¿ya hay uno activo?
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
        return res.json({
          pass: {
            id: existing.id,
            code: existing.code,
            status: existing.status,
            kind: existing.kind,
            expiresAt: existing.expiresAt,
            createdAt: existing.createdAt,
          },
        });
      }

      // revocar activos viejos por higiene
      await prisma.qRPass.updateMany({
        where: { userId: req.user.id, kind, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });

      const code = crypto.randomBytes(16).toString('hex');
      const pass = await prisma.qRPass.create({
        data: { code, userId: req.user.id, kind, expiresAt, status: 'ACTIVE' },
        select: {
          id: true,
          code: true,
          status: true,
          kind: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      await createAccessLog({
        kind,
        action: 'ISSUE',
        userId: req.user.id,
        qrId: pass.id,
      });

      res.json({ pass });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudo emitir el QR' });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/qr/my-active?kind=ENTRY&autocreate=1
// ─────────────────────────────────────────────────────────────
router.get(
  '/my-active',
  auth,
  requireRole(['USER', 'ADMIN']),
  async (req, res) => {
    try {
      const kind = String(req.query?.kind || '').toUpperCase();
      if (!isValidKind(kind)) {
        return res.status(400).json({ error: 'Kind inválido' });
      }

      const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { accessState: true },
      });
      const accessState = u?.accessState || 'OUTSIDE';

      if (accessState === 'INSIDE' && kind === 'ENTRY') {
        return res.status(409).json({
          error: 'Tu QR de entrada está deshabilitado. Debes salir primero.',
        });
      }
      if (accessState === 'OUTSIDE' && kind === 'EXIT') {
        return res.status(409).json({
          error: 'Tu QR de salida está deshabilitado. Debes entrar primero.',
        });
      }

      const autocreate = String(req.query?.autocreate || '') === '1';

      let pass = await prisma.qRPass.findFirst({
        where: {
          userId: req.user.id,
          kind,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          code: true,
          status: true,
          kind: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      if (!pass && autocreate) {
        const ttlMin = Math.max(
          1,
          Number(process.env.QR_TTL_MINUTES || 10080)
        );
        const expiresAt = computeExpiresAtWithSundayCap(ttlMin);

        await prisma.qRPass.updateMany({
          where: { userId: req.user.id, kind, status: 'ACTIVE' },
          data: { status: 'REVOKED' },
        });

        const code = crypto.randomBytes(16).toString('hex');
        pass = await prisma.qRPass.create({
          data: {
            code,
            userId: req.user.id,
            kind,
            expiresAt,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            code: true,
            status: true,
            kind: true,
            expiresAt: true,
            createdAt: true,
          },
        });

        await createAccessLog({
          kind,
          action: 'ISSUE',
          userId: req.user.id,
          qrId: pass.id,
        });
      }

      return res.json({ pass: pass || null });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'No se pudo consultar el QR activo' });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/qr/validate   (GUARD / ADMIN)
// ─────────────────────────────────────────────────────────────
router.post(
  '/validate',
  auth,
  requireRole(['GUARD', 'ADMIN']),
  async (req, res) => {
    try {
      const { code } = req.body || {};
      if (typeof code !== 'string' || code.length < 16) {
        return res.status(400).json({
          ok: false,
          result: 'INVALID_QR',
          reason: 'code inválido',
          owner: null,
          pass: null,
        });
      }

      const pass = await prisma.qRPass.findUnique({
        where: { code },
        include: {
          user: {
            select: {
              id: true,
              role: true,
              name: true,
              boleta: true,
              email: true,
              contactEmail: true,
              firstName: true,
              lastNameP: true,
              lastNameM: true,
              accessState: true,
              institutionalType: true,
              photoUrl: true,
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
              state: true,
            },
          },
        },
      });

      if (!pass) {
        await createAccessLog({
          kind: 'ENTRY',
          action: 'VALIDATE_DENY',
          guardId: req.user.id,
        });
        return res.status(404).json({
          ok: false,
          result: 'INVALID_QR',
          reason: 'QR no encontrado',
          owner: null,
          pass: null,
        });
      }

      const owner = buildOwner(pass);
      const accessType = pass.kind === 'EXIT' ? 'EXIT' : 'ENTRY';
      const now = new Date();
      const isInstitutional = !!pass.userId; // 👈 clave: distinguir institucional vs invitado

      // 1) status distinto de ACTIVE
      if (pass.status !== 'ACTIVE') {
        let reason = 'QR no activo';
        let result = 'INVALID_QR';
        if (pass.status === 'EXPIRED') {
          reason = 'QR expirado. Solicita uno nuevo.';
          result = 'EXPIRED_QR';
        } else if (pass.status === 'USED') {
          reason = 'QR ya fue utilizado.';
        } else if (pass.status === 'REVOKED') {
          reason = 'QR revocado. Genera uno nuevo.';
        }

        // Registrar intento fallido
        recordAttempt(pass,
          pass.status === 'EXPIRED' ? 'EXPIRED'
          : pass.status === 'USED' ? 'USED'
          : pass.status === 'REVOKED' ? 'REVOKED'
          : 'FAILED_STATUS',
          reason
        );
        // Opcional: correo en fallos de estado
        if (pass.user && pass.user.role === 'USER' && pass.user.institutionalType && pass.user.email) {
          sendAccessNotificationEmail({
            to: pass.user.email,
            name: pass.user.name || [pass.user.firstName, pass.user.lastNameP, pass.user.lastNameM].filter(Boolean).join(' '),
            type: accessType,
            date: new Date(),
            locationName: 'ESCOM',
            reason
          }).catch(err => console.error('Email (status deny):', err));
        }
        return res.status(400).json({
          ok: false,
          result,
          reason,
          owner,
          pass: { kind: pass.kind, status: pass.status },
        });
      }

      // 2) expirado por fecha/hora (solo usuarios institucionales) 👈 MODIFICADO
      if (isInstitutional && pass.expiresAt && pass.expiresAt <= now) {
        const reason = 'QR expirado. Solicita uno nuevo.';
        await prisma.qRPass.update({
          where: { id: pass.id },
          data: { status: 'EXPIRED' },
        });

        // Intento expirado
        recordAttempt(pass, 'EXPIRED', reason);
        if (pass.user && pass.user.role === 'USER' && pass.user.institutionalType && pass.user.email) {
          sendAccessNotificationEmail({
            to: pass.user.email,
            name: pass.user.name || [pass.user.firstName, pass.user.lastNameP, pass.user.lastNameM].filter(Boolean).join(' '),
            type: accessType,
            date: new Date(),
            locationName: 'ESCOM',
            reason
          }).catch(err => console.error('Email (expired deny):', err));
        }
        return res.status(400).json({
          ok: false,
          result: 'EXPIRED_QR',
          reason,
          owner,
          pass: { kind: pass.kind, status: 'EXPIRED' },
        });
      }

      // 3) Usuario institucional
      if (pass.userId && pass.user) {
        const u = pass.user;

        if (pass.kind === 'ENTRY' && u.accessState === 'INSIDE') {
          const reason = 'Usuario ya se encuentra dentro.';
          await createAccessLog({
            kind: pass.kind,
            action: 'VALIDATE_DENY',
            userId: u.id,
            qrId: pass.id,
            guardId: req.user.id,
          });
          recordAttempt(pass, 'STATE_DENY', reason);
          if (u.role === 'USER' && u.institutionalType && u.email) {
            sendAccessNotificationEmail({
              to: [u.email, u.contactEmail].filter(Boolean).join(','),
              name: u.name || [u.firstName, u.lastNameP, u.lastNameM].filter(Boolean).join(' '),
              type: accessType,
              date: new Date(),
              locationName: 'ESCOM',
              reason
            }).catch(err => console.error('Email (already inside):', err));
          }
          return res.status(400).json({
            ok: false,
            result: 'DENIED',
            reason,
            owner,
            pass: { kind: pass.kind, status: pass.status },
          });
        }

        if (pass.kind === 'EXIT' && u.accessState === 'OUTSIDE') {
          const reason = 'Usuario aún no ha entrado.';
          await createAccessLog({
            kind: pass.kind,
            action: 'VALIDATE_DENY',
            userId: u.id,
            qrId: pass.id,
            guardId: req.user.id,
          });
          recordAttempt(pass, 'STATE_DENY', reason);
          if (u.role === 'USER' && u.institutionalType && u.email) {
            sendAccessNotificationEmail({
              to: [u.email, u.contactEmail].filter(Boolean).join(','),
              name: u.name || [u.firstName, u.lastNameP, u.lastNameM].filter(Boolean).join(' '),
              type: accessType,
              date: new Date(),
              locationName: 'ESCOM',
              reason
            }).catch(err => console.error('Email (not entered yet):', err));
          }
          return res.status(400).json({
            ok: false,
            result: 'DENIED',
            reason,
            owner,
            pass: { kind: pass.kind, status: pass.status },
          });
        }

        const newState = u.accessState === 'OUTSIDE' ? 'INSIDE' : 'OUTSIDE';
        await prisma.user.update({
          where: { id: u.id },
          data: { accessState: newState },
        });

        await createAccessLog({
          kind: pass.kind,
          action: 'VALIDATE_ALLOW',
          userId: u.id,
          qrId: pass.id,
          guardId: req.user.id,
        });

        const ownerAllowed = buildOwner({
          ...pass,
          user: { ...u, accessState: newState },
        });

        // 📧 Enviar correo solo a usuarios institucionales con correo y tipo institucional definido
        const isInstitutionalUser =
          u.role === 'USER' && !!u.institutionalType && !!u.email;

        if (isInstitutionalUser) {
          try {
            await sendAccessNotificationEmail({
              to: u.email,
              name: ownerAllowed?.name || u.name,
              type: accessType,
              date: new Date(),
              locationName: 'ESCOM',
            }).catch(err => console.error('Email acceso async:', err));
          } catch (mailErr) {
            console.error('Error enviando correo de acceso (validate):', mailErr);
          }
        }
        // Registrar éxito
        recordAttempt(pass, 'SUCCESS', pass.kind === 'EXIT' ? 'Salida permitida' : 'Acceso permitido');

        return res.json({
          ok: true,
          result: 'ALLOWED',
          reason: pass.kind === 'EXIT' ? 'Salida permitida' : 'Acceso permitido',
          accessType,
          owner: ownerAllowed,
          pass: { kind: pass.kind, status: pass.status },
        });
      }

      // 4) Invitado
      if (pass.guestId && pass.guest) {
        const g = pass.guest;

        if (pass.kind === 'ENTRY' && g.state === 'INSIDE') {
          const reason = 'Invitado ya se encuentra dentro.';
          await createAccessLog({
            kind: pass.kind,
            action: 'VALIDATE_DENY',
            guestId: g.id,
            qrId: pass.id,
            guardId: req.user.id,
          });
          return res.status(400).json({
            ok: false,
            result: 'DENIED',
            reason,
            owner,
            pass: { kind: pass.kind, status: pass.status },
          });
        }

        if (pass.kind === 'EXIT' && g.state === 'OUTSIDE') {
          const reason = 'Invitado aún no ha entrado.';
          await createAccessLog({
            kind: pass.kind,
            action: 'VALIDATE_DENY',
            guestId: g.id,
            qrId: pass.id,
            guardId: req.user.id,
          });
          return res.status(400).json({
            ok: false,
            result: 'DENIED',
            reason,
            owner,
            pass: { kind: pass.kind, status: pass.status },
          });
        }

        await prisma.qRPass.update({
          where: { id: pass.id },
          data: { status: 'USED' },
        });

        const newState = pass.kind === 'ENTRY' ? 'INSIDE' : 'COMPLETED';
        await prisma.guestVisit.update({
          where: { id: g.id },
          data: { state: newState },
        });

        await createAccessLog({
          kind: pass.kind,
          action: 'VALIDATE_ALLOW',
          guestId: g.id,
          qrId: pass.id,
          guardId: req.user.id,
        });

        const ownerAllowed = buildOwner({
          ...pass,
          guest: { ...g, state: newState },
        });

        return res.json({
          ok: true,
          result: 'ALLOWED',
          reason: pass.kind === 'EXIT' ? 'Salida permitida' : 'Acceso permitido',
          accessType,
          owner: ownerAllowed,
          pass: { kind: pass.kind, status: 'USED' },
        });
      }

      // 5) Caso raro: pass sin user ni guest
      const reason = 'QR inválido';
      await createAccessLog({
        kind: pass.kind,
        action: 'VALIDATE_DENY',
        qrId: pass.id,
        guardId: req.user.id,
      });

      return res.status(400).json({
        ok: false,
        result: 'INVALID_QR',
        reason,
        owner: null,
        pass: { kind: pass.kind, status: pass.status },
      });
    } catch (e) {
      console.error('QR/validate error:', e);
      return res.status(500).json({
        ok: false,
        result: 'ERROR',
        reason: 'Error al validar',
        owner: null,
        pass: null,
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/qr/ensure-both  (USER/ADMIN)
// ─────────────────────────────────────────────────────────────
router.post(
  '/ensure-both',
  auth,
  requireRole(['USER', 'ADMIN']),
  async (req, res) => {
    try {
      const ttlMin = Math.max(
        1,
        Number(process.env.QR_TTL_MINUTES || 10080)
      );
      const fixedExpiresAt = computeExpiresAtWithSundayCap(ttlMin);

      const result = await prisma.$transaction(async (tx) => {
        const [entryActive, exitActive] = await Promise.all([
          tx.qRPass.findFirst({
            where: {
              userId: req.user.id,
              kind: 'ENTRY',
              status: 'ACTIVE',
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { createdAt: 'desc' },
          }),
          tx.qRPass.findFirst({
            where: {
              userId: req.user.id,
              kind: 'EXIT',
              status: 'ACTIVE',
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { createdAt: 'desc' },
          }),
        ]);

        let entry = entryActive;
        let exit = exitActive;

        const createWithFixed = (kind) =>
          tx.qRPass.create({
            data: {
              code: crypto.randomBytes(16).toString('hex'),
              userId: req.user.id,
              kind,
              status: 'ACTIVE',
              expiresAt: fixedExpiresAt,
            },
            select: {
              id: true,
              code: true,
              kind: true,
              status: true,
              expiresAt: true,
              createdAt: true,
            },
          });

        if (!entry) {
          await tx.qRPass.updateMany({
            where: { userId: req.user.id, kind: 'ENTRY', status: 'ACTIVE' },
            data: { status: 'REVOKED' },
          });
          entry = await createWithFixed('ENTRY');
          await tx.accessLog.create({
            data: {
              kind: 'ENTRY',
              action: 'ISSUE',
              user: { connect: { id: req.user.id } },
              qr: { connect: { id: entry.id } },
            },
          });
        }

        if (!exit) {
          await tx.qRPass.updateMany({
            where: { userId: req.user.id, kind: 'EXIT', status: 'ACTIVE' },
            data: { status: 'REVOKED' },
          });
          exit = await createWithFixed('EXIT');
          await tx.accessLog.create({
            data: {
              kind: 'EXIT',
              action: 'ISSUE',
              user: { connect: { id: req.user.id } },
              qr: { connect: { id: exit.id } },
            },
          });
        }

        return { entry, exit };
      });

      res.json({ ok: true, entry: result.entry, exit: result.exit });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudieron asegurar los QR' });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// C) GET /api/qr/logs (ADMIN)
// ─────────────────────────────────────────────────────────────
router.get('/logs', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const take = Math.min(parseInt(req.query.take || '50', 10), 200);
    const skip = parseInt(req.query.skip || '0', 10);

    const [items, total] = await Promise.all([
      prisma.accessLog.findMany({
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              firstName: true,
              lastNameP: true,
              lastNameM: true,
              boleta: true,
              email: true,
              role: true,
            },
          },
          guest: {
            select: {
              firstName: true,
              lastNameP: true,
              lastNameM: true,
              curp: true,
              reason: true,
            },
          },
          guard: { select: { name: true, email: true } },
          qr: { select: { code: true, kind: true } },
        },
      }),
      prisma.accessLog.count(),
    ]);

    res.json({ items, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudieron obtener los logs' });
  }
});

// ─────────────────────────────────────────────────────────────
// D) GET /api/qr/stats  (ADMIN)
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Solo pruebas: resetear estado del usuario
// ─────────────────────────────────────────────────────────────
router.post('/reset-state', auth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { accessState: 'OUTSIDE' },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo resetear el estado' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/qr/scan  (GUARD / ADMIN)
// (usa accessEvent, no toca accessLog)
// ─────────────────────────────────────────────────────────────
router.post('/scan', auth, requireRole(['GUARD', 'ADMIN']), async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'Falta code' });

  try {
    const pass = await prisma.qRPass.findUnique({
      where: { code },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            name: true,
            boleta: true,
            email: true,
            contactEmail: true,
            firstName: true,
            lastNameP: true,
            lastNameM: true,
            accessState: true,
            institutionalType: true,
            photoUrl: true,
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
            state: true,
          },
        },
      },
    });

    let result = 'INVALID_QR';
    let reason = 'Código no encontrado';
    let subjectType = 'INSTITUTIONAL';
    let userId = null;
    let guestId = null;
    let expiresAt = null;

    if (pass) {
      expiresAt = pass.expiresAt || null;
      if (pass.userId) {
        subjectType = 'INSTITUTIONAL';
        userId = pass.userId;
      }
      if (pass.guestId) {
        subjectType = 'GUEST';
        guestId = pass.guestId;
      }

      const now = new Date();
      const isInstitutional = !!pass.userId;

      if (pass.status !== 'ACTIVE') {
        result = 'INVALID_QR';
        reason = 'QR no activo';
      } else if (isInstitutional && pass.expiresAt && pass.expiresAt < now) {
        result = 'EXPIRED_QR';
        reason = 'QR vencido';
      } else {
        result = 'ALLOWED';
        reason = 'QR válido';
      }
    }

    const accessType = pass?.kind === 'EXIT' ? 'EXIT' : 'ENTRY';

    await prisma.accessEvent.create({
      data: {
        subjectType,
        userId,
        guestId,
        guardId: req.user.id,
        accessType,
        result,
        reason,
      },
    });

    // 👇 NUEVO: si es invitado y el escaneo fue permitido, marcar USED + actualizar estado
    if (pass && pass.guestId && result === 'ALLOWED') {
      // Marcar el QR como usado
      await prisma.qRPass.update({
        where: { id: pass.id },
        data: { status: 'USED' },
      });

      // Actualizar estado del invitado
      if (pass.guest) {
        const newState = pass.kind === 'ENTRY' ? 'INSIDE' : 'COMPLETED';
        await prisma.guestVisit.update({
          where: { id: pass.guest.id },
          data: { state: newState },
        });
      }
    }

    // 📧 Enviar correo si es usuario institucional y el QR fue permitido
    if (
      result === 'ALLOWED' &&
      pass?.user &&
      pass.user.role === 'USER' &&
      pass.user.institutionalType &&
      pass.user.email
    ) {
      try {
        await sendAccessNotificationEmail({
          to: pass.user.email,
          name: pass.user.name || [
            pass.user.firstName,
            pass.user.lastNameP,
            pass.user.lastNameM,
          ].filter(Boolean).join(' '),
          type: accessType,
          date: new Date(),
          locationName: 'ESCOM',
        }).catch(err => console.error('Email acceso async:', err));
      } catch (mailErr) {
        console.error('Error enviando correo de acceso (scan):', mailErr);
      }
    }

    let owner = null;
    if (pass?.user) {
      owner = {
        kind: 'INSTITUTIONAL',
        id: pass.user.id,
        name: pass.user.name,
        boleta: pass.user.boleta,
        email: pass.user.email,
        institutionalType: pass.user.institutionalType || null,
        photoUrl: pass.user.photoUrl || null,
      };
    } else if (pass?.guest) {
      owner = {
        role: 'GUEST',
        kind: 'GUEST',
        id: pass.guest.id,
        name: [
          pass.guest.firstName,
          pass.guest.lastNameP,
          pass.guest.lastNameM,
        ].filter(Boolean).join(' '),
        firstName: pass.guest.firstName,
        lastNameP: pass.guest.lastNameP,
        lastNameM: pass.guest.lastNameM,
        curp: pass.guest.curp || null,
        reason: pass.guest.reason || null,
      };
    }

    return res.json({
      ok: result === 'ALLOWED',
      result,
      reason,
      accessType,
      expiresAt,
      owner,
    });
  } catch (e) {
    console.error('QR/scan error:', e);
    return res
      .status(500)
      .json({ ok: false, error: 'No se pudo validar el QR' });
  }
});

// ─────────────────────────────────────────────────────────────
// E) GET /api/qr/last-accesses?take=10&skip=0 (GUARD/ADMIN)
// ─────────────────────────────────────────────────────────────
router.get('/last-accesses', auth, requireRole(['GUARD', 'ADMIN']), async (req, res) => {
  try {
    const take = Math.min(parseInt(req.query.take || '10', 10), 50);
    const skip = Math.max(0, parseInt(req.query.skip || '0', 10));

    const [accesses, total] = await Promise.all([
      prisma.accessLog.findMany({
        where: {
          action: {
            not: 'ISSUE'
          }
        },
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              firstName: true,
              lastNameP: true,
              lastNameM: true,
              boleta: true,
              photoUrl: true,
            }
          },
          guest: {
            select: {
              firstName: true,
              lastNameP: true,
              lastNameM: true,
              curp: true,
              reason: true
            }
          },
          qr: {
            select: { kind: true, status: true }
          },
        },
      }),
      prisma.accessLog.count({
        where: {
          action: {
            not: 'ISSUE'
          }
        }
      }),
    ]);

    const normalized = accesses.map(a => ({
      ...a,
      guest: a.guest ? {
        ...a.guest,
        name: [a.guest.firstName, a.guest.lastNameP, a.guest.lastNameM].filter(Boolean).join(' '),
      } : null
    }));

    res.json({
      accesses: normalized,
      pagination: {
        total,
        take,
        skip,
        totalPages: Math.ceil(total / take),
        currentPage: Math.floor(skip / take) + 1,
      }
    });
  } catch (e) {
    console.error('Error fetching last accesses:', e);
    res.status(500).json({ error: 'No se pudieron obtener los accesos' });
  }
});

module.exports = router;  // ← Esta es la ÚNICA exportación, al final del archivo
