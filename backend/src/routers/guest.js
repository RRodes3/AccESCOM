const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { validateCurpPrefix } = require('../utils/curp');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Letras con acentos y espacios
const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
// CURP 18 chars: 4 letras + 6 dígitos + H/M + 5 letras + alfanum + dígito
const RE_CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i;
// Motivo: letras/dígitos/espacios y símbolos comunes (UNICODE)
const RE_REASON = /^[\p{L}\p{N}\s.,#()\-]{5,160}$/u;

const TTL_MIN = Math.max(1, parseInt(process.env.GUEST_QR_TTL_MINUTES || '60', 10)); // 60 min por defecto
const now = () => new Date();
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const rnd = () => crypto.randomBytes(16).toString('hex');

// POST /api/guest/register
router.post('/register', async (req, res) => {
  try {
    let { firstName, lastNameP, lastNameM, curp, reason } = req.body || {};
    firstName = String(firstName || '').trim();
    lastNameP = String(lastNameP || '').trim();
    lastNameM = String(lastNameM || '').trim();
    curp      = String(curp || '').toUpperCase().trim();
    reason    = String(reason || '').trim();

    const errors = {};

    // 1) Validaciones de formato
    if (firstName.length < 3 || !RE_LETTERS.test(firstName))
      errors.firstName = 'Nombre: solo letras y espacios (mín. 3).';

    if (lastNameP.length < 2 || !RE_LETTERS.test(lastNameP))
      errors.lastNameP = 'Apellido paterno: solo letras y espacios (mín. 2).';

    if (lastNameM && (lastNameM.length < 2 || !RE_LETTERS.test(lastNameM)))
      errors.lastNameM = 'Apellido materno: solo letras y espacios (mín. 2) o deja vacío.';

    if (!RE_CURP.test(curp))
      errors.curp = 'CURP con formato inválido.';

    if (!RE_REASON.test(reason))
      errors.reason = 'Motivo: 5–160 caracteres (letras/números/espacios y . , # ( ) -).';

    // Si ya hay errores de forma, devuélvelos todos de una vez
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validación fallida', errors });
    }

    // 2) Consistencia CURP ↔ nombres
    const { ok, expected } = validateCurpPrefix(curp, { firstName, lastNameP, lastNameM });
    if (!ok) {
      return res.status(400).json({
        error: 'Validación de CURP fallida',
        errors: {
          curp: `La CURP no coincide con los nombres/apellidos. Prefijo esperado: ${expected}.`
        }
      });
    }

    // 3) Crear visita e inmediatamente emitir 2 QR de un solo uso (ENTRY/EXIT)
    // ¿Existe visita activa para ese CURP?
    const existing = await prisma.guestVisit.findFirst({
      where: {
        curp,
        OR: [
          { state: { in: ['OUTSIDE', 'INSIDE'] } },
          { expiresAt: { gt: new Date() } },
        ]
      },
      include: {
        passes: {
          where: { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        }
      }
    });

    if (existing) {
      // Si ya tiene QR activos, regrésalos tal cual
      const entry = existing.passes.find(p => p.kind === 'ENTRY');
      const exit  = existing.passes.find(p => p.kind === 'EXIT');
      return res.status(200).json({
        ok: true,
        reused: true,
        visitor: {
          id: existing.id, firstName: existing.firstName, lastNameP: existing.lastNameP,
          lastNameM: existing.lastNameM, curp: existing.curp, reason: existing.reason,
          createdAt: existing.createdAt, expiresAt: existing.expiresAt,
        },
        passes: {
          ENTRY: entry ? { code: entry.code, kind: 'ENTRY', expiresAt: entry.expiresAt, status: entry.status } : null,
          EXIT:  exit  ? { code: exit.code,  kind: 'EXIT',  expiresAt: exit.expiresAt,  status: exit.status  } : null,
        }
      });
    }

    // Crear TODO dentro de una transacción
    const result = await prisma.$transaction(async (tx) => {
      const visit = await tx.guestVisit.create({
        data: {
          firstName, lastNameP, lastNameM, curp, reason,
          expiresAt: new Date(Date.now() + TTL_MIN * 60 * 1000)
        }
      });
      const expiresAt = visit.expiresAt;
      const [entry, exit] = await Promise.all([
        tx.qRPass.create({ data: { code: crypto.randomBytes(16).toString('hex'), guestId: visit.id, kind: 'ENTRY', expiresAt } }),
        tx.qRPass.create({ data: { code: crypto.randomBytes(16).toString('hex'), guestId: visit.id, kind: 'EXIT',  expiresAt } }),
      ]);
      return { visit, entry, exit };
    });

    return res.status(201).json({
      ok: true,
      visitor: {
        id: result.visit.id, firstName: result.visit.firstName, lastNameP: result.visit.lastNameP,
        lastNameM: result.visit.lastNameM, curp: result.visit.curp, reason: result.visit.reason,
        createdAt: result.visit.createdAt, expiresAt: result.visit.expiresAt,
      },
      passes: {
        ENTRY: { code: result.entry.code, kind: 'ENTRY', expiresAt: result.entry.expiresAt, status: result.entry.status },
        EXIT:  { code: result.exit.code,  kind: 'EXIT',  expiresAt: result.exit.expiresAt,  status: result.exit.status  },
      }
    });
  } catch (e) {
    console.error('GUEST /register error:', e);
    return res.status(500).json({ error: 'No se pudo registrar la visita' });
  }
});

module.exports = router;
