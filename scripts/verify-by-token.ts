
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyUserByToken(token: string) {
  try {
    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      console.error(`User with verification token ${token} not found.`);
      process.exit(1);
    }

    if (user.emailVerified) {
      console.log(`User ${user.email} is already verified.`);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
      },
    });

    console.log(`Successfully verified user: ${user.email}`);
  } catch (error) {
    console.error('Error verifying user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const token = process.argv[2];

if (!token) {
  console.error('Please provide a verification token as an argument.');
  console.log('Usage: npx tsx scripts/verify-by-token.ts <token>');
  process.exit(1);
}

verifyUserByToken(token);
