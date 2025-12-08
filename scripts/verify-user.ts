
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyUser(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`User with email ${email} not found.`);
      process.exit(1);
    }

    if (user.emailVerified) {
      console.log(`User ${email} is already verified.`);
      return;
    }

    await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
      },
    });

    console.log(`Successfully verified user: ${email}`);
  } catch (error) {
    console.error('Error verifying user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error('Please provide an email address as an argument.');
  console.log('Usage: npx tsx scripts/verify-user.ts <email>');
  process.exit(1);
}

verifyUser(email);
