const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function createUser(name, email, password, role) {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (!exists) {
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { name, email, password: hash, role }
    });
    console.log(`✅ Usuario creado: ${email} (rol: ${role}, pass: ${password})`);
  } else {
    console.log(`ℹ️ Usuario ya existe: ${email}`);
  }
}

async function main() {
  await createUser('Admin', 'admin@demo.com', '123456', 'ADMIN');
  await createUser('Usuario Normal', 'user@demo.com', '123456', 'USER');
  await createUser('Guardia', 'guard@demo.com', '123456', 'GUARD');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
