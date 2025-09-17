// backend/src/routers/guest.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// TTL separado para invitados (minutos)
const GUEST_TTL_MINUTES = Math.max(5, parseInt(process.env.QR_GUEST_TTL_MINUTES || '1440', 10)); // default 24h

// Validaciones rápidas
const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_CURP    = /^[A-Z]{4}\d{6}[HM][A-Z]{5}\d{2}$/i; // curp clásico; relaja si lo necesitas

router.post('/register', async (req, res) => {
  try {
    let { firstName, lastNameP, lastNameM, curp, reason } = req.body || {};
    firstName = String(firstName||'').trim();
    lastNameP = String(lastNameP||'').trim();
    lastNameM = String(lastNameM||'').trim();
    curp      = String(curp||'').trim().toUpperCase();
    reason    = String(reason||'').trim();

    const errors = {};
    if (!firstName || !RE_LETTERS.test(firstName)) errors.firstName = 'Nombre inválido';
    if (!lastNameP || !RE_LETTERS.test(lastNameP)) errors.lastNameP = 'Apellido paterno inválido';
    if (lastNameM && !RE_LETTERS.test(lastNameM))  errors.lastNameM = 'Apellido materno inválido';
    if (!curp || !RE_CURP.test(curp))              errors.curp = 'CURP inválida';
    if (!reason || reason.length < 3)              errors.reason = 'Motivo muy corto';

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validación', errors });
    }

    // Si ya existe un registro todavía vigente con esa CURP y no está COMPLETED, bloquear:
    const existing = await prisma.guestVisit.findFirst({
      where: {
        curp,
        NOT: { state: 'COMPLETED' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      include: { passes: true }
    });
    if (existing) {
      return res.status(409).json({ error: 'Ya tienes un registro vigente. Completa tu visita antes de generar otro.' });
    }

    const expiresAt = new Date(Date.now() + GUEST_TTL_MINUTES * 60 * 1000);
    const guest = await prisma.guestVisit.create({
      data: { firstName, lastNameP, lastNameM: lastNameM || null, curp, reason, expiresAt }
    });

    // Generar 2 QR de un solo uso: ENTRY y EXIT
    const entryCode = crypto.randomBytes(16).toString('hex');
    const exitCode  = crypto.randomBytes(16).toString('hex');

    const [entry, exit] = await prisma.$transaction([
      prisma.qRPass.create({
        data: {
          code: entryCode,
          kind: 'ENTRY',
          guestId: guest.id,
          status: 'ACTIVE',
          expiresAt
        }
      }),
      prisma.qRPass.create({
        data: {
          code: exitCode,
          kind: 'EXIT',
          guestId: guest.id,
          status: 'ACTIVE',
          expiresAt
        }
      }),
    ]);

    return res.json({
      ok: true,
      guest: {
        id: guest.id, firstName, lastNameP, lastNameM, curp, reason, expiresAt
      },
      passes: {
        entry: { code: entry.code, kind: 'ENTRY', expiresAt: entry.expiresAt },
        exit:  { code: exit.code,  kind: 'EXIT',  expiresAt: exit.expiresAt }
      }
    });
  } catch (e) {
    console.error('GUEST REGISTER ERROR:', e);
    res.status(500).json({ error: 'No se pudo registrar al invitado' });
  }
});

module.exports = router;
