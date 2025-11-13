// backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const strong = (plain) => bcrypt.hash(plain, 10);

async function main() {
  // Contraseñas que cumplen tu regla (≥12 chars, mayúsc, minúsc, número, símbolo)
  const P_ADMIN = 'Admin#2025_secure';
  const P_GUARD = 'Guard#2025_secure';
  const P_USER  = 'User#2025_secure!';

  const users = [
    {
      boleta: '2025000001',
      firstName: 'Admin',
      lastNameP: 'ESCOM',
      lastNameM: 'IPN',
      name: 'Admin ESCOM IPN',
      email: 'admin@demo.com',
      password: await strong(P_ADMIN),
      role: 'ADMIN',
    },
    {
      boleta: '2025000002',
      firstName: 'Guardia',
      lastNameP: 'ESCOM',
      lastNameM: 'IPN',
      name: 'Guardia ESCOM IPN',
      email: 'guard@demo.com',
      password: await strong(P_GUARD),
      role: 'GUARD',
    },
    {
      boleta: '2025000003',
      firstName: 'Alumno',
      lastNameP: 'Demo',
      lastNameM: 'ESCOM',
      name: 'Alumno Demo ESCOM',
      email: 'user@demo.com',
      password: await strong(P_USER),
      role: 'USER',
      institutionalType: 'STUDENT', // 👈 opcional: define tipo institucional
    },
  ];

  // upsert por email (evita duplicados si corres el seed otra vez)
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
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
        institutionalType: u.role === 'USER' ? (u.institutionalType || null) : null,
      },
    });
  }

  console.log('\n✓ Seed listo.');
  console.log('Credenciales de prueba:');
  console.log(`  ADMIN: ${users[0].email} / ${P_ADMIN}`);
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
