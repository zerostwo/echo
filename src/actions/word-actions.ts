'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';

export async function getWordContext(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    // Fetch occurrences and related sentences
    // We also want to know which material the sentence belongs to
    const occurrences = await prisma.wordOccurrence.findMany({
        where: {
            wordId: wordId,
            sentence: {
                material: {
                    userId: session.user.id
                }
            }
        },
        include: {
            sentence: {
                include: {
                    material: {
                        select: { 
                            id: true,
                            title: true 
                        }
                    }
                }
            }
        },
        take: 10 // Limit to 10 examples
    });

    return { occurrences };
}

export async function updateWordStatus(wordId: string, status: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        await prisma.userWordStatus.upsert({
            where: {
                userId_wordId: {
                    userId: session.user.id,
                    wordId: wordId
                }
            },
            update: { status },
            create: {
                userId: session.user.id,
                wordId,
                status
            }
        });
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update status' };
    }
}

export async function updateWordsStatus(wordIds: string[], status: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        // Loop because upsertMany isn't standard or simple in Prisma for composite keys
        // But we can do transaction
        await prisma.$transaction(
            wordIds.map(wordId => 
                prisma.userWordStatus.upsert({
                    where: {
                        userId_wordId: {
                            userId: session.user.id,
                            wordId: wordId
                        }
                    },
                    update: { status },
                    create: {
                        userId: session.user.id,
                        wordId,
                        status
                    }
                })
            )
        );
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to update statuses' };
    }
}

