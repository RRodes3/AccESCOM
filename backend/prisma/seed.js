// backend/prisma/seed.js
require('dotenv').config(); // para usar .env en local

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const strong = (plain) => bcrypt.hash(plain, 10);

async function main() {
  // 👇 Tomamos el admin de variables de entorno (si no existen, usamos los defaults)
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@demo.com';
  const P_ADMIN = process.env.SUPER_ADMIN_PASS || 'Admin#2025_secure';

  // Estas puedes dejarlas fijas o también pasarlas a ENV si un día quieres
  const P_GUARD = process.env.GUARD_PASS || 'Guard#2025_secure';
  const P_USER  = process.env.USER_PASS  || 'User#2025_secure!';

  const users = [
    {
      boleta: '2025000001',
      firstName: 'Admin',
      lastNameP: 'ESCOM',
      lastNameM: 'IPN',
      name: 'Admin ESCOM IPN',
      email: ADMIN_EMAIL,
      passwordPlain: P_ADMIN,
      role: 'ADMIN',
    },
    {
      boleta: '2025000002',
      firstName: 'Guardia',
      lastNameP: 'ESCOM',
      lastNameM: 'IPN',
      name: 'Guardia ESCOM IPN',
      email: 'guard@demo.com',
      passwordPlain: P_GUARD,
      role: 'GUARD',
    },
    {
      boleta: '2025000003',
      firstName: 'Alumno',
      lastNameP: 'Demo',
      lastNameM: 'ESCOM',
      name: 'Alumno Demo ESCOM',
      email: 'user@demo.com',
      passwordPlain: P_USER,
      role: 'USER',
      institutionalType: 'STUDENT',
    },
  ];

  // Pre-hash de contraseñas
  for (const u of users) {
    u.password = await strong(u.passwordPlain);
  }

  // upsert por email: si existe, ACTUALIZA datos clave (incluida contraseña)
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        boleta: u.boleta,
        firstName: u.firstName,
        lastNameP: u.lastNameP,
        lastNameM: u.lastNameM,
        name: u.name,
        role: u.role,
        password: u.password,
        isActive: true,
        enabled: true,
        institutionalType: u.role === 'USER' ? (u.institutionalType || null) : null,
        failedAttempts: 0,
      },
      create: {
        boleta: u.boleta,
        firstName: u.firstName,
        lastNameP: u.lastNameP,
        lastNameM: u.lastNameM,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        isActive: true,
        accessState: 'OUTSIDE', // valor seguro para empezar
        institutionalType: u.role === 'USER' ? (u.institutionalType || null) : null,
        mustChangePassword: false,
        enabled: true,
        failedAttempts: 0,
      },
    });
  }

  console.log('\n✓ Seed listo.');
  console.log('Credenciales de prueba:');
  console.log(`  ADMIN: ${ADMIN_EMAIL} / ${P_ADMIN}`);
  console.log(`  GUARD: ${users[1].email} / ${P_GUARD}`);
  console.log(`  USER : ${users[2].email} / ${P_USER}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
