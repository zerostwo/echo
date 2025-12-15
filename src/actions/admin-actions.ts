'use server';
import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';
import { DATABASE_ID, COLLECTION_IDS } from '@/lib/appwrite_client';
import { Query } from 'node-appwrite';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'system-settings.json');

async function checkAdmin() {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
    return session;
}

export async function getAdminStats() {
    await checkAdmin();
    const { databases } = await getAdminClient();
    
    // Run queries in parallel
    const [users, materials, words] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'users', [Query.limit(0)]),
        databases.listDocuments(DATABASE_ID, COLLECTION_IDS.materials, [Query.limit(0)]),
        databases.listDocuments(DATABASE_ID, COLLECTION_IDS.words, [Query.limit(0)])
    ]);
    
    return {
        users: users.total,
        materials: materials.total,
        words: words.total,
    };
}

export async function getUsers(page = 1, limit = 20, search = '') {
    await checkAdmin();
    const { databases } = await getAdminClient();
    
    const queries = [
        Query.limit(limit),
        Query.offset((page - 1) * limit),
        Query.orderDesc('created_at')
    ];

    if (search) {
        queries.push(Query.or([
            Query.search('email', search),
            Query.search('display_name', search)
        ]));
    }

    const { documents, total } = await databases.listDocuments(
        DATABASE_ID, 
        'users', 
        queries
    );

    return { users: documents, total };
}

export async function updateQuota(userId: string, newQuotaGB: number) {
    try {
        await checkAdmin();
        const { databases } = await getAdminClient();
        const quotaBytes = BigInt(newQuotaGB) * BigInt(1024 * 1024 * 1024);
        
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            userId,
            { quota: quotaBytes.toString() }
        );
        
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update quota' };
    }
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    try {
        await checkAdmin();
        const { databases, users } = await getAdminClient();
        
        // Update DB
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            userId,
            { is_active: isActive }
        );

        // Update Appwrite Auth status
        await users.updateStatus(userId, isActive);

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update user status' };
    }
}

export async function updateUserRole(userId: string, role: string) {
    try {
        await checkAdmin();
        const { databases } = await getAdminClient();
        
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            userId,
            { role }
        );

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update user role' };
    }
}

export async function deleteUser(userId: string) {
    try {
        await checkAdmin();
        const { databases, users } = await getAdminClient();
        
        // Delete from DB
        await databases.deleteDocument(DATABASE_ID, 'users', userId);
        
        // Delete from Auth
        await users.delete(userId);

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to delete user' };
    }
}

export async function getSystemSettings() {
    await checkAdmin();
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Return default settings if file doesn't exist
        return {
            email: {
                smtpHost: '',
                smtpPort: 587,
                smtpUser: '',
                smtpPass: '',
                fromEmail: '',
            },
            site: {
                maintenanceMode: false,
                allowRegistration: true,
            }
        };
    }
}

export async function updateSystemSettings(settings: any) {
    await checkAdmin();
    try {
        await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        return { success: true };
    } catch (error) {
        return { error: 'Failed to save settings' };
    }
}
