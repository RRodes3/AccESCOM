// backend/src/routers/qr.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const prisma = new PrismaClient();

/**
 * POST /api/qr/issue
 * USER/ADMIN emite un QR (1 activo a la vez, TTL con límites)
 */
router.post('/issue', auth, requireRole(['USER','ADMIN']), async (req, res) => {
  try {
    // ----- Mini hardening: TTL mínimo/máximo -----
    const ttl = Math.max(1, Math.min(Number(req.body?.ttlMinutes || 30), 1440)); // 1min..24h
    const code = crypto.randomBytes(16).toString('hex'); // 32 chars
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    // (Opcional) Revocar QR activos previos del mismo usuario
    await prisma.qRPass.updateMany({
      where: { userId: req.user.id, status: 'ACTIVE' },
      data: { status: 'REVOKED' }
    });

    const pass = await prisma.qRPass.create({
      data: { code, userId: req.user.id, expiresAt },
      select: { id: true, code: true, expiresAt: true, status: true, createdAt: true }
    });

    await prisma.accessLog.create({
      data: { userId: req.user.id, qrId: pass.id, action: 'ISSUE' }
    });

    res.json({ pass });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo emitir el QR' });
  }
});

/**
 * POST /api/qr/validate
 * GUARD/ADMIN valida un QR
 */
router.post('/validate', auth, requireRole(['GUARD','ADMIN']), async (req, res) => {
  try {
    const { code } = req.body || {};
    // ----- Mini hardening: validar "code" -----
    if (typeof code !== 'string' || code.length < 16) {
      return res.status(400).json({ ok: false, reason: 'code inválido' });
    }

    const pass = await prisma.qRPass.findUnique({ where: { code } });
    if (!pass) {
      return res.status(404).json({ ok: false, reason: 'QR no encontrado' });
    }

    // Expiración
    if (pass.expiresAt && pass.expiresAt < new Date()) {
      await prisma.qRPass.update({ where: { id: pass.id }, data: { status: 'EXPIRED' } });
      await prisma.accessLog.create({
        data: { userId: pass.userId, qrId: pass.id, action: 'VALIDATE_DENY', guardId: req.user.id }
      });
      return res.status(400).json({ ok: false, reason: 'QR expirado' });
    }

    // Estado
    if (pass.status !== 'ACTIVE') {
      await prisma.accessLog.create({
        data: { userId: pass.userId, qrId: pass.id, action: 'VALIDATE_DENY', guardId: req.user.id }
      });
      return res.status(400).json({ ok: false, reason: `QR ${pass.status}` });
    }

    // Marcar como usado (idempotencia simple)
    await prisma.qRPass.update({ where: { id: pass.id }, data: { status: 'USED' } });
    await prisma.accessLog.create({
      data: { userId: pass.userId, qrId: pass.id, action: 'VALIDATE_ALLOW', guardId: req.user.id }
    });

    const owner = await prisma.user.findUnique({
      where: { id: pass.userId },
      select: { id: true, name: true, email: true, role: true, boleta: true }
    });
    res.json({ ok: true, owner, pass: { status: 'USED' } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, reason: 'Error validando' });
  }
});

/**
 * A) GET /api/qr/my-active
 * USER/ADMIN consulta su QR activo (si existe)
 */
router.get('/my-active', auth, requireRole(['USER','ADMIN']), async (req, res) => {
  try {
    const pass = await prisma.qRPass.findFirst({
      where: {
        userId: req.user.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, status: true, expiresAt: true, createdAt: true }
    });
    res.json({ pass });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo consultar el QR activo' });
  }
});

/**
 * B) POST /api/qr/revoke
 * ADMIN revoca un QR por id o code
 */
router.post('/revoke', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id, code } = req.body || {};
    if (!id && !code) return res.status(400).json({ error: 'Falta id o code' });

    const where = id ? { id: Number(id) } : { code: String(code) };
    const pass = await prisma.qRPass.findUnique({ where });
    if (!pass) return res.status(404).json({ error: 'QR no encontrado' });

    await prisma.qRPass.update({ where, data: { status: 'REVOKED' } });
    await prisma.accessLog.create({
      data: { userId: pass.userId, qrId: pass.id, action: 'VALIDATE_DENY', guardId: req.user.id }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo revocar' });
  }
});

/**
 * C) GET /api/qr/logs?take=50&skip=0
 * ADMIN lista bitácora
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
          user:  { select: { name: true, email: true } },
          guard: { select: { name: true, email: true } },
          qr:    { select: { code: true } }
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

module.exports = router;
