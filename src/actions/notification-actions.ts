'use server';

import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';

export type NotificationType = 
  | 'MATERIAL_UPLOADED'
  | 'MATERIAL_PROCESSED' 
  | 'VOCAB_EXTRACTED'
  | 'PRACTICE_MILESTONE'
  | 'SYSTEM';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  relatedId?: string | null;
  relatedType?: string | null;
  createdAt: string;
}

export async function getNotifications(limit: number = 50): Promise<{ notifications?: Notification[], error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  try {
    const client = supabaseAdmin || supabase;
    
    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const notifications: Notification[] = (data || []).map(n => ({
      id: n.id,
      userId: n.user_id,
      type: n.type as NotificationType,
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      relatedId: n.related_id,
      relatedType: n.related_type,
      createdAt: n.created_at,
    }));

    return { notifications };
  } catch (e) {
    console.error('Failed to get notifications:', e);
    return { error: 'Failed to get notifications' };
  }
}

export async function getUnreadCount(): Promise<{ count?: number, error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  try {
    const client = supabaseAdmin || supabase;
    
    const { count, error } = await client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false);

    if (error) throw error;

    return { count: count || 0 };
  } catch (e) {
    console.error('Failed to get unread count:', e);
    return { error: 'Failed to get unread count' };
  }
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  relatedId?: string,
  relatedType?: string
): Promise<{ success?: boolean, error?: string }> {
  try {
    const client = supabaseAdmin || supabase;
    
    const { error } = await client
      .from('notifications')
      .insert({
        id: randomUUID(),
        user_id: userId,
        type,
        title,
        message,
        is_read: false,
        related_id: relatedId || null,
        related_type: relatedType || null,
        created_at: new Date().toISOString(),
      });

    if (error) throw error;

    return { success: true };
  } catch (e) {
    console.error('Failed to create notification:', e);
    return { error: 'Failed to create notification' };
  }
}

export async function markAsRead(notificationId: string): Promise<{ success?: boolean, error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  try {
    const client = supabaseAdmin || supabase;
    
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', session.user.id);

    if (error) throw error;

    return { success: true };
  } catch (e) {
    console.error('Failed to mark notification as read:', e);
    return { error: 'Failed to mark notification as read' };
  }
}

export async function markAllAsRead(): Promise<{ success?: boolean, error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  try {
    const client = supabaseAdmin || supabase;
    
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false);

    if (error) throw error;

    return { success: true };
  } catch (e) {
    console.error('Failed to mark all notifications as read:', e);
    return { error: 'Failed to mark all notifications as read' };
  }
}

export async function deleteNotification(notificationId: string): Promise<{ success?: boolean, error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  try {
    const client = supabaseAdmin || supabase;
    
    const { error } = await client
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', session.user.id);

    if (error) throw error;

    return { success: true };
  } catch (e) {
    console.error('Failed to delete notification:', e);
    return { error: 'Failed to delete notification' };
  }
}

export async function clearAllNotifications(): Promise<{ success?: boolean, error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  try {
    const client = supabaseAdmin || supabase;
    
    const { error } = await client
      .from('notifications')
      .delete()
      .eq('user_id', session.user.id);

    if (error) throw error;

    return { success: true };
  } catch (e) {
    console.error('Failed to clear notifications:', e);
    return { error: 'Failed to clear notifications' };
  }
}

