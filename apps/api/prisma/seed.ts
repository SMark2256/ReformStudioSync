import { PrismaClient, Role, PassType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const studioId = 'default-studio';
  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
  const receptionPasswordHash = await bcrypt.hash('Recepcio123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@reformstudio.hu' },
    update: {},
    create: {
      studioId,
      email: 'admin@reformstudio.hu',
      name: 'ReformStudio Adminisztrátor',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  const receptionist = await prisma.user.upsert({
    where: { email: 'recepcio@reformstudio.hu' },
    update: {},
    create: {
      studioId,
      email: 'recepcio@reformstudio.hu',
      name: 'Recepciós Munkatárs',
      passwordHash: receptionPasswordHash,
      role: Role.RECEPTIONIST,
    },
  });

  const templates = [
    {
      name: '1 Alkalmas Napijegy',
      type: PassType.OCCASION_BASED,
      totalPasses: 1,
      durationDays: 7,
      price: 6500,
    },
    {
      name: '5 Alkalmas Reformer Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 5,
      durationDays: 35,
      price: 29000,
    },
    {
      name: '10 Alkalmas Reformer Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 10,
      durationDays: 60,
      price: 54000,
    },
    {
      name: 'Havi Korlátlan Reformer Bérlet',
      type: PassType.TIME_BASED,
      totalPasses: null,
      durationDays: 30,
      price: 69000,
    },
  ];

  for (const tpl of templates) {
    const existing = await prisma.passTemplate.findFirst({
      where: { studioId, name: tpl.name },
    });
    if (!existing) {
      await prisma.passTemplate.create({
        data: {
          studioId,
          ...tpl,
        },
      });
    }
  }

  console.log('Seed completed:', {
    admin: admin.email,
    receptionist: receptionist.email,
    templatesCount: templates.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
