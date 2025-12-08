
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listUnverified() {
  try {
    const users = await prisma.user.findMany({
      where: { emailVerified: null },
      select: { email: true, id: true, createdAt: true, verificationToken: true },
    });

    if (users.length === 0) {
      console.log('No unverified users found.');
    } else {
      console.log('Unverified users:');
      users.forEach(u => {
        console.log(`- Email: ${u.email}, Created: ${u.createdAt}, Token: ${u.verificationToken}`);
      });
    }
  } catch (error) {
    console.error('Error listing users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listUnverified();
