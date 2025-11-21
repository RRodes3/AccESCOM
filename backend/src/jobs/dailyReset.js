// backend/src/jobs/dailyReset.js
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CLEANUP_DAYS = 7; // días después de los cuales limpiamos registros viejos

/**
 * Pasa todos los usuarios INSIDE → OUTSIDE
 * y registra un log AUTO_RESET.
 */
async function resetInsideUsers() {
  const now = new Date();
  console.log(`[AUTO-RESET] Ejecutando a las ${now.toISOString()}`);

  const insideUsers = await prisma.user.findMany({
    where: { accessState: 'INSIDE' },
    select: {
      id: true,
      boleta: true,
      firstName: true,
      lastNameP: true,
      lastNameM: true,
      name: true,
      email: true,
      contactEmail: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      institutionalType: true,
      createdAt: true,
    },
  });

  if (!insideUsers.length) {
    console.log('[AUTO-RESET] No hay usuarios INSIDE.');
    return;
  }

  const ids = insideUsers.map((u) => u.id);

  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { accessState: 'OUTSIDE' },
  });

  await prisma.accessLog.createMany({
    data: ids.map((id) => ({
      userId: id,
      action: 'VALIDATE_ALLOW', // reutilizado
      kind: 'EXIT',
    })),
    skipDuplicates: true,
  });

  // (omitimos AccessLog porque enum no soporta AUTO_RESET)
  console.log(`[AUTO-RESET] Usuarios reseteados: ${ids.length}`);
}

/**
 * Elimina tokens de password reset expirados o ya usados
 */
async function cleanupExpiredTokens() {
  const now = new Date();
  const cutoffDate = new Date(
    now.getTime() - CLEANUP_DAYS * 24 * 60 * 60 * 1000
  );

  console.log(`[TOKEN-CLEANUP] Ejecutando a las ${now.toISOString()}`);
  console.log(
    `[TOKEN-CLEANUP] Eliminando tokens anteriores a ${cutoffDate.toISOString()}`
  );

  try {
    const result = await prisma.passwordReset.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoffDate } },
          { AND: [{ usedAt: { not: null } }, { usedAt: { lt: cutoffDate } }] },
        ],
      },
    });
    console.log(`[TOKEN-CLEANUP] Tokens eliminados: ${result.count}`);
  } catch (e) {
    console.error('[TOKEN-CLEANUP] Error:', e);
  }
}

/**
 * Programa el job diario de reset a las 23:00 (hora CDMX)
 */
function setupDailyResetJobs(options = {}) {
  const { runOnStart = false } = options;

  cron.schedule(
    '0 23 * * *',
    () => {
      resetInsideUsers().catch((e) =>
        console.error('[AUTO-RESET] Error:', e)
      );
    },
    { timezone: 'America/Mexico_City' }
  );

  console.log('[AUTO-RESET] Job programado: 23:00 America/Mexico_City');

  cron.schedule(
    '0 2 * * *',
    () => {
      cleanupExpiredTokens().catch((e) =>
        console.error('[TOKEN-CLEANUP] Error:', e)
      );
    },
    { timezone: 'America/Mexico_City' }
  );

  console.log('[TOKEN-CLEANUP] Job programado: 02:00 America/Mexico_City');

  if (runOnStart) {
    resetInsideUsers().catch((e) =>
      console.error('[AUTO-RESET] Error (runOnStart):', e)
    );
    cleanupExpiredTokens().catch((e) =>
      console.error('[TOKEN-CLEANUP] Error (runOnStart):', e)
    );
  }
}

module.exports = { setupDailyResetJobs };
