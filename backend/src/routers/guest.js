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
const RE_REASON = /^[\p{L}\p{N}\s.,#()\-\u0023]{5,160}$/u; // permite #, -, paréntesis, etc.

const TTL_MIN = Math.max(1, parseInt(process.env.GUEST_QR_TTL_MINUTES || '60', 10)); // 60 min por defecto (solo para expiresAt de visita)
const now = () => new Date();
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const rnd = () => crypto.randomBytes(16).toString('hex');

// Normaliza el payload de QR para el frontend
const packPass = (p) => p && ({
  code: p.code,
  kind: p.kind,
  expiresAt: p.expiresAt,
  status: p.status,
});

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

    // 3) Buscar visita vigente SOLO si está INSIDE y no ha expirado
    // NO reutilizar visitas en OUTSIDE o COMPLETED (invitado debe re-registrarse para nueva visita)
    const activeVisit = await prisma.guestVisit.findFirst({
      where: {
        curp,
        state: 'INSIDE',  // ← SOLO INSIDE (ongoing visit)
        expiresAt: { gt: now() },  // ← Y aún no expirada
      },
      include: {
        passes: {
          where: { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }] },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Helper para emitir faltantes (o ambos) de forma atómica
    const emitMissingPasses = async (visit) => {
      const stillValid = visit.expiresAt && visit.expiresAt > now();
      const expiresAt  = stillValid ? visit.expiresAt : addMin(now(), TTL_MIN);

      return await prisma.$transaction(async (tx) => {
        // Si la visita ya venció, actualiza su expiresAt
        if (!stillValid) {
          await tx.guestVisit.update({
            where: { id: visit.id },
            data:  { expiresAt },
          });
        }

        // Busca los activos otra vez dentro de la transacción
        const current = await tx.qRPass.findMany({
          where: {
            guestId: visit.id,
            status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
          },
        });

        let entry = current.find(p => p.kind === 'ENTRY');
        let exit  = current.find(p => p.kind === 'EXIT');

        // Crea los que falten SIN expiración por tiempo (expiresAt: null)
        if (!entry) {
          entry = await tx.qRPass.create({
            data: { 
              code: rnd(), 
              guestId: visit.id, 
              kind: 'ENTRY', 
              expiresAt: null  // ← SIN expiración por tiempo
            },
          });
        }
        if (!exit) {
          exit = await tx.qRPass.create({
            data: { 
              code: rnd(), 
              guestId: visit.id, 
              kind: 'EXIT', 
              expiresAt: null  // ← SIN expiración por tiempo
            },
          });
        }

        return { entry, exit, expiresAt };
      });
    };

    if (activeVisit) {
      // Si hay visita, asegura que tenga ambos QR activos
      const entry = activeVisit.passes.find(p => p.kind === 'ENTRY') || null;
      const exit  = activeVisit.passes.find(p => p.kind === 'EXIT')  || null;

      if (entry && exit) {
        return res.status(200).json({
          ok: true,
          reused: true,
          visitor: {
            id: activeVisit.id,
            firstName: activeVisit.firstName,
            lastNameP: activeVisit.lastNameP,
            lastNameM: activeVisit.lastNameM,
            curp: activeVisit.curp,
            reason: activeVisit.reason,
            createdAt: activeVisit.createdAt,
            expiresAt: activeVisit.expiresAt,
          },
          passes: {
            ENTRY: packPass(entry),
            EXIT:  packPass(exit),
          },
        });
      }

      // Si faltan, emítelos
      const emitted = await emitMissingPasses(activeVisit);

      return res.status(200).json({
        ok: true,
        reused: true,
        visitor: {
          id: activeVisit.id,
          firstName: activeVisit.firstName,
          lastNameP: activeVisit.lastNameP,
          lastNameM: activeVisit.lastNameM,
          curp: activeVisit.curp,
          reason: activeVisit.reason,
          createdAt: activeVisit.createdAt,
          expiresAt: emitted.expiresAt,
        },
        passes: {
          ENTRY: packPass(emitted.entry),
          EXIT:  packPass(emitted.exit),
        },
      });
    }

    // 4) No hay visita vigente → crea visita + 2 QR SIN expiración por tiempo
    const result = await prisma.$transaction(async (tx) => {
      const visit = await tx.guestVisit.create({
        data: {
          firstName, lastNameP, lastNameM, curp, reason,
          expiresAt: addMin(now(), TTL_MIN),
          state: 'OUTSIDE',
        },
      });

      const [entry, exit] = await Promise.all([
        tx.qRPass.create({ 
          data: { 
            code: rnd(), 
            guestId: visit.id, 
            kind: 'ENTRY', 
            expiresAt: null  // ← SIN expiración por tiempo
          } 
        }),
        tx.qRPass.create({ 
          data: { 
            code: rnd(), 
            guestId: visit.id, 
            kind: 'EXIT', 
            expiresAt: null  // ← SIN expiración por tiempo
          } 
        }),
      ]);

      return { visit, entry, exit };
    });

    return res.status(201).json({
      ok: true,
      visitor: {
        id: result.visit.id,
        firstName: result.visit.firstName,
        lastNameP: result.visit.lastNameP,
        lastNameM: result.visit.lastNameM,
        curp: result.visit.curp,
        reason: result.visit.reason,
        createdAt: result.visit.createdAt,
        expiresAt: result.visit.expiresAt,
      },
      passes: {
        ENTRY: packPass(result.entry),
        EXIT:  packPass(result.exit),
      },
    });
  } catch (e) {
    console.error('GUEST /register error:', e);
    return res.status(500).json({ error: 'No se pudo registrar la visita' });
  }
});

// GET /api/guest/my-active?visitId=123&kind=ENTRY|EXIT
// Devuelve el QR activo permitido por el estado de la visita.
// Regla: OUTSIDE -> solo ENTRY,   INSIDE -> solo EXIT,   COMPLETED -> ninguno.
router.get('/my-active', async (req, res) => {
  try {
    const visitId = parseInt(req.query.visitId || '0', 10);
    const kindRaw = String(req.query.kind || '').toUpperCase();
    if (!visitId || (kindRaw !== 'ENTRY' && kindRaw !== 'EXIT')) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    const visit = await prisma.guestVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        state: true,
        expiresAt: true,
        passes: {
          where: {
            kind: kindRaw,
          },
          select: { id: true, code: true, kind: true, status: true, expiresAt: true },
          orderBy: { id: 'desc' },
        }
      }
    });

    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });

    // Verificar si todos los QR (ENTRY y EXIT) ya fueron usados
    const allPasses = await prisma.qRPass.findMany({
      where: { guestId: visitId },
      select: { kind: true, status: true }
    });
    
    const entryPass = allPasses.find(p => p.kind === 'ENTRY');
    const exitPass = allPasses.find(p => p.kind === 'EXIT');
    const bothUsed = entryPass?.status === 'USED' && exitPass?.status === 'USED';

    if (bothUsed) {
      return res.status(400).json({ 
        error: 'Tu QR está deshabilitado, vuelve a llenar el formulario de registro para volver a generar un nuevo QR.',
        allUsed: true 
      });
    }

    // Gate por estado
    if (visit.state === 'OUTSIDE' && kindRaw === 'EXIT') {
      return res.status(400).json({ error: 'Tu QR de salida está deshabilitado. Debes entrar primero.' });
    }
    if (visit.state === 'INSIDE' && kindRaw === 'ENTRY') {
      return res.status(400).json({ error: 'Tu QR de entrada está deshabilitado. Debes salir primero.' });
    }
    if (visit.state === 'COMPLETED') {
      return res.status(400).json({ error: 'La visita ya fue concluida.' });
    }

    // Buscar el QR activo solicitado
    const pass = visit.passes.find(p => 
      p.status === 'ACTIVE' && 
      (p.expiresAt === null || new Date(p.expiresAt) > new Date())
    ) || null;
    
    if (!pass) {
      return res.status(404).json({ error: 'No hay QR vigente de ese tipo.' });
    }

    return res.json({ pass });
  } catch (e) {
    console.error('GUEST /my-active error:', e);
    res.status(500).json({ error: 'No se pudo consultar el QR activo' });
  }
});

module.exports = router;
