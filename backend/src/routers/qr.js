// backend/src/routers/qr.js
const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { sendAccessNotificationEmail } = require('../utils/mailer');

const prisma = new PrismaClient();
const router = express.Router();


/* =========================================================
   RUTA NUEVA: accesos del usuario actual (/qr/my-access)
   ========================================================= */
router.get('/my-access', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Usar AccessEvent en lugar de QRAttempt para obtener más información
    const logs = await prisma.accessEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        guard: {
          select: {
            name: true,
            firstName: true,
            lastNameP: true
          }
        }
      }
    });

    res.json({ ok: true, logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Error obteniendo accesos' });
  }
});

/* =========================================================
   Helpers y lógica QR
   ========================================================= */

// Registrar intentos institucionales
function recordAttempt(pass, status, reason) {
  try {
    if (!pass?.userId) return;
    return prisma.qRAttempt
      .create({
        data: {
          userId: pass.userId,
          status: String(status),
          reason: (reason ?? '').toString().slice(0, 160),
        },
      })
      .catch((e) => console.error('QRAttempt create error:', e));
  } catch (e) {
    console.error('recordAttempt skipped:', e);
  }
}

// Helper para nombre completo
function buildFullName(u) {
  return (
    u.name ||
    [u.firstName, u.lastNameP, u.lastNameM].filter(Boolean).join(' ')
  );
}

// Tiempo
function getNextSundayCutoff(baseDate = new Date()) {
  const now = new Date(baseDate);
  const expiry = new Date(now);
  const day = expiry.getDay();
  const daysUntilSunday = (7 - day) % 7;
  expiry.setDate(expiry.getDate() + daysUntilSunday);
  expiry.setHours(23, 0, 0, 0);
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

// AccessLog helper
async function createAccessLog({
  kind,
  action,
  userId,
  guestId,
  qrId,
  guardId,
}) {
  const data = { kind, action };
  if (userId) data.user = { connect: { id: userId } };
  if (guestId) data.guest = { connect: { id: guestId } };
  if (qrId) data.qr = { connect: { id: qrId } };
  if (guardId) data.guard = { connect: { id: guardId } };
  return prisma.accessLog.create({ data });
}

// AccessEvent helper (para "Últimos accesos")
async function createAccessEvent({
  subjectType,
  userId,
  guestId,
  guardId,
  accessType,
  result,
  reason,
}) {
  try {
    await prisma.accessEvent.create({
      data: {
        subjectType,
        userId: userId || null,
        guestId: guestId || null,
        guardId: guardId || null,
        accessType,
        result,
        reason,
      },
    });
  } catch (e) {
    console.error('AccessEvent create error:', e);
  }
}

// Dueño del QR
function buildOwner(pass) {
  if (!pass) return null;
  if (pass.user) {
    const u = pass.user;
    return {
      kind: 'INSTITUTIONAL',
      role: u.role,
      id: u.id,
      name: buildFullName(u),
      firstName: u.firstName,
      lastNameP: u.lastNameP,
      lastNameM: u.lastNameM,
      boleta: u.boleta,
      email: u.email,
      contactEmail: u.contactEmail || null,
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

// Validar tipo
function isValidKind(kind) {
  if (typeof kind !== 'string') return false;
  const k = kind.trim().toUpperCase();
  const extra = (process.env.QR_EXTRA_KINDS || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return new Set(['ENTRY', 'EXIT', ...extra]).has(k);
}

/* =========================================================
   Rutas QR
   ========================================================= */

// Emitir QR
router.post('/issue', auth, requireRole(['USER', 'ADMIN']), async (req, res) => {
  try {
    const kind = String(req.body?.kind || '').toUpperCase();
    if (!isValidKind(kind))
      return res.status(400).json({ error: 'Kind inválido' });

    const ttlMin = Math.max(1, Number(process.env.QR_TTL_MINUTES || 10080));
    const expiresAt = computeExpiresAtWithSundayCap(ttlMin);

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
});

// Consultar QR activo
router.get(
  '/my-active',
  auth,
  requireRole(['USER', 'ADMIN']),
  async (req, res) => {
    try {
      const kind = String(req.query?.kind || '').toUpperCase();
      if (!isValidKind(kind))
        return res.status(400).json({ error: 'Kind inválido' });

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
        const ttlMin = Math.max(1, Number(process.env.QR_TTL_MINUTES || 10080));
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

      res.json({ pass: pass || null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudo consultar el QR activo' });
    }
  }
);

// Validar (guard/admin)
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

        await createAccessEvent({
          subjectType: 'UNKNOWN',
          userId: null,
          guestId: null,
          guardId: req.user.id,
          accessType: 'ENTRY',
          result: 'INVALID_QR',
          reason: 'QR no encontrado',
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
      const isInstitutional = !!pass.userId;

      // Estado no activo
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

        recordAttempt(
          pass,
          pass.status === 'EXPIRED'
            ? 'EXPIRED'
            : pass.status === 'USED'
            ? 'USED'
            : pass.status === 'REVOKED'
            ? 'REVOKED'
            : 'FAILED_STATUS',
          reason
        );

        if (
          pass.user &&
          pass.user.role === 'USER' &&
          pass.user.institutionalType &&
          pass.user.email
        ) {
          const u = pass.user;
          const recipient = u.contactEmail || u.email;
          console.log('📧 Notificación estado no activo a:', recipient);
          sendAccessNotificationEmail({
            to: recipient,
            name: buildFullName(u),
            type: accessType,
            date: new Date(),
            locationName: 'ESCOM',
            reason,
          }).catch((err) => console.error('Email (status deny):', err));
        }

        await createAccessEvent({
          subjectType: isInstitutional ? 'INSTITUTIONAL' : 'GUEST',
          userId: pass.userId || null,
          guestId: pass.guestId || null,
          guardId: req.user.id,
          accessType,
          result,
          reason,
        });

        return res.status(400).json({
          ok: false,
          result,
          reason,
          owner,
          pass: { kind: pass.kind, status: pass.status },
        });
      }

      // Expirado por fecha (institucional)
      if (isInstitutional && pass.expiresAt && pass.expiresAt <= now) {
        const reason = 'QR expirado. Solicita uno nuevo.';
        await prisma.qRPass.update({
          where: { id: pass.id },
          data: { status: 'EXPIRED' },
        });
        recordAttempt(pass, 'EXPIRED', reason);

        if (
          pass.user &&
          pass.user.role === 'USER' &&
          pass.user.institutionalType &&
          pass.user.email
        ) {
          const u = pass.user;
          const recipient = u.contactEmail || u.email;
          console.log('📧 Notificación expirado a:', recipient);
          sendAccessNotificationEmail({
            to: recipient,
            name: buildFullName(u),
            type: accessType,
            date: new Date(),
            locationName: 'ESCOM',
            reason,
          }).catch((err) => console.error('Email (expired deny):', err));
        }

        await createAccessEvent({
          subjectType: 'INSTITUTIONAL',
          userId: pass.userId,
          guestId: null,
          guardId: req.user.id,
          accessType,
          result: 'EXPIRED_QR',
          reason,
        });

        return res.status(400).json({
          ok: false,
          result: 'EXPIRED_QR',
          reason,
          owner,
          pass: { kind: pass.kind, status: pass.status },
        });
      }

      // Usuario institucional
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

          await createAccessEvent({
            subjectType: 'INSTITUTIONAL',
            userId: u.id,
            guestId: null,
            guardId: req.user.id,
            accessType,
            result: 'DENIED',
            reason,
          });

          if (u.role === 'USER' && u.institutionalType && u.email) {
            const recipient = u.contactEmail || u.email;
            console.log('📧 Notificación ya dentro a:', recipient);
            sendAccessNotificationEmail({
              to: recipient,
              name: buildFullName(u),
              type: accessType,
              date: new Date(),
              locationName: 'ESCOM',
              reason,
            }).catch((err) => console.error('Email (already inside):', err));
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

          await createAccessEvent({
            subjectType: 'INSTITUTIONAL',
            userId: u.id,
            guestId: null,
            guardId: req.user.id,
            accessType,
            result: 'DENIED',
            reason,
          });

          if (u.role === 'USER' && u.institutionalType && u.email) {
            const recipient = u.contactEmail || u.email;
            console.log('📧 Notificación aún no entra a:', recipient);
            sendAccessNotificationEmail({
              to: recipient,
              name: buildFullName(u),
              type: accessType,
              date: new Date(),
              locationName: 'ESCOM',
              reason,
            }).catch((err) =>
              console.error('Email (not entered yet):', err)
            );
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

        const successReason =
          pass.kind === 'EXIT' ? 'Salida permitida' : 'Acceso permitido';

        recordAttempt(pass, 'SUCCESS', successReason);

        await createAccessEvent({
          subjectType: 'INSTITUTIONAL',
          userId: u.id,
          guestId: null,
          guardId: req.user.id,
          accessType,
          result: 'ALLOWED',
          reason: successReason,
        });

        res.json({
          ok: true,
          result: 'ALLOWED',
          reason: successReason,
          accessType,
          owner: ownerAllowed,
          pass: { kind: pass.kind, status: pass.status },
        });

        if (u.role === 'USER' && u.institutionalType && u.email) {
          setImmediate(() => {
            const recipient = u.contactEmail || u.email;
            console.log(
              '📧 Notificación acceso permitido (validate) a:',
              recipient
            );
            sendAccessNotificationEmail({
              to: recipient,
              name: ownerAllowed?.name || buildFullName(u),
              type: accessType,
              date: new Date(),
              locationName: 'ESCOM',
            }).catch((err) =>
              console.error('Email acceso async (validate):', err)
            );
          });
        }
        return;
      }

      // Invitado
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

          await createAccessEvent({
            subjectType: 'GUEST',
            userId: null,
            guestId: g.id,
            guardId: req.user.id,
            accessType,
            result: 'DENIED',
            reason,
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

          await createAccessEvent({
            subjectType: 'GUEST',
            userId: null,
            guestId: g.id,
            guardId: req.user.id,
            accessType,
            result: 'DENIED',
            reason,
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

        const successReasonGuest =
          pass.kind === 'EXIT' ? 'Salida permitida' : 'Acceso permitido';

        await createAccessEvent({
          subjectType: 'GUEST',
          userId: null,
          guestId: g.id,
          guardId: req.user.id,
          accessType,
          result: 'ALLOWED',
          reason: successReasonGuest,
        });

        return res.json({
          ok: true,
          result: 'ALLOWED',
          reason: successReasonGuest,
          accessType,
          owner: ownerAllowed,
          pass: { kind: pass.kind, status: 'USED' },
        });
      }

      // Caso raro
      const reason = 'QR inválido';
      await createAccessLog({
        kind: pass.kind,
        action: 'VALIDATE_DENY',
        qrId: pass.id,
        guardId: req.user.id,
      });

      await createAccessEvent({
        subjectType: isInstitutional ? 'INSTITUTIONAL' : 'GUEST',
        userId: pass.userId || null,
        guestId: pass.guestId || null,
        guardId: req.user.id,
        accessType,
        result: 'INVALID_QR',
        reason,
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

// Asegurar ambos QR
router.post(
  '/ensure-both',
  auth,
  requireRole(['USER', 'ADMIN']),
  async (req, res) => {
    try {
      const ttlMin = Math.max(1, Number(process.env.QR_TTL_MINUTES || 10080));
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

// Logs históricos (accessLog) - admin
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

// Últimos accesos rápidos (accessEvent) - guard + admin
router.get(
  '/last-accesses',
  auth,
  requireRole(['GUARD', 'ADMIN']),
  async (req, res) => {
    try {
      const take = Math.min(parseInt(req.query.take || '10', 10), 200);
      const skip = parseInt(req.query.skip || '0', 10);

      const [items, total] = await Promise.all([
        prisma.accessEvent.findMany({
          take,
          skip,
          orderBy: { createdAt: 'desc' },
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
              },
            },
            guard: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.accessEvent.count(),
      ]);

      res.json({ items, total });
    } catch (e) {
      console.error('qr/last-accesses error:', e);
      res
        .status(500)
        .json({ error: 'No se pudieron obtener los últimos accesos' });
    }
  }
);

// Stats
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

// Reset estado (pruebas)
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

// Scan rápido (solo registra evento ligero y posible notificación)
router.post(
  '/scan',
  auth,
  requireRole(['GUARD', 'ADMIN']),
  async (req, res) => {
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

      if (pass && pass.guestId && result === 'ALLOWED') {
        await prisma.qRPass.update({
          where: { id: pass.id },
          data: { status: 'USED' },
        });
        if (pass.guest) {
          const newState = pass.kind === 'ENTRY' ? 'INSIDE' : 'COMPLETED';
          await prisma.guestVisit.update({
            where: { id: pass.guest.id },
            data: { state: newState },
          });
        }
      }

      let owner = null;
      if (pass?.user) {
        owner = {
          kind: 'INSTITUTIONAL',
          id: pass.user.id,
          name: buildFullName(pass.user),
          boleta: pass.user.boleta,
          email: pass.user.email,
          contactEmail: pass.user.contactEmail || null,
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
          ]
            .filter(Boolean)
            .join(' '),
          firstName: pass.guest.firstName,
          lastNameP: pass.guest.lastNameP,
          lastNameM: pass.guest.lastNameM,
          curp: pass.guest.curp || null,
          reason: pass.guest.reason || null,
        };
      }

      res.json({
        ok: result === 'ALLOWED',
        result,
        reason,
        accessType,
        expiresAt,
        owner,
      });

      if (
        result === 'ALLOWED' &&
        pass?.user &&
        pass.user.role === 'USER' &&
        pass.user.institutionalType &&
        pass.user.email
      ) {
        setImmediate(() => {
          const u = pass.user;
          const recipient = u.contactEmail || u.email;
          console.log(
            '📧 Notificación acceso permitido (scan) a:',
            recipient
          );
          sendAccessNotificationEmail({
            to: recipient,
            name: buildFullName(u),
            type: accessType,
            date: new Date(),
            locationName: 'ESCOM',
          }).catch((err) =>
            console.error('Email acceso async (scan):', err)
          );
        });
      }
    } catch (e) {
      console.error('QR/scan error:', e);
      return res
        .status(500)
        .json({ ok: false, error: 'No se pudo validar el QR' });
    }
  }
);

/* =========================================================
   Export
   ========================================================= */
module.exports = router;
