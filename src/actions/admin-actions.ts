'use server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
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
    
    // Run queries in parallel
    const [users, materials, words] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('materials').select('*', { count: 'exact', head: true }),
        supabase.from('words').select('*', { count: 'exact', head: true })
    ]);
    
    return {
        users: users.count || 0,
        materials: materials.count || 0,
        words: words.count || 0,
    };
}

export async function getUsers(page = 1, limit = 20, search = '') {
    await checkAdmin();
    
    let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .range((page - 1) * limit, page * limit - 1)
        .order('created_at', { ascending: false });

    if (search) {
        query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return { users: data, total: count || 0 };
}

export async function updateQuota(userId: string, newQuotaGB: number) {
    try {
        await checkAdmin();
        const quotaBytes = BigInt(newQuotaGB) * BigInt(1024 * 1024 * 1024);
        
        const { error } = await supabase
            .from('users')
            .update({ quota: quotaBytes.toString() })
            .eq('id', userId);

        if (error) throw error;
        
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update quota' };
    }
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    try {
        await checkAdmin();
        
        const { error } = await supabase
            .from('users')
            .update({ is_active: isActive })
            .eq('id', userId);

        if (error) throw error;

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update user status' };
    }
}

export async function updateUserRole(userId: string, role: string) {
    try {
        await checkAdmin();
        
        const { error } = await supabase
            .from('users')
            .update({ role })
            .eq('id', userId);

        if (error) throw error;

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update user role' };
    }
}

export async function deleteUser(userId: string) {
    try {
        await checkAdmin();
        
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;

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
