// backend/src/jobs/dailyReset.js
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Pasa todos los usuarios INSIDE → OUTSIDE
 * y registra un log AUTO_RESET.
 */
async function resetInsideUsers() {
  const now = new Date();
  console.log(`[AUTO-RESET] Ejecutando a las ${now.toISOString()}`);

  const insideUsers = await prisma.user.findMany({
    where: { accessState: 'INSIDE' },
    select: { id: true },
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

  // Ajusta a tu esquema real de accessLog
  await prisma.accessLog.createMany({
    data: ids.map((id) => ({
      userId: id,
      action: 'AUTO_RESET',
      kind: 'EXIT',
      description: 'Salida automática diaria a las 23:00',
    })),
    skipDuplicates: true,
  });

  console.log(`[AUTO-RESET] Usuarios reseteados: ${ids.length}`);
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

  if (runOnStart) {
    resetInsideUsers().catch((e) =>
      console.error('[AUTO-RESET] Error (runOnStart):', e)
    );
  }
}

module.exports = { setupDailyResetJobs };
