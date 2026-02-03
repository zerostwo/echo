'use server';

import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';
import { ID, Query } from 'node-appwrite';

const NOTIFICATIONS_COLLECTION_ID = 'notifications';

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
    const { databases } = await getAdminClient();
    
    // Use $createdAt for ordering (Appwrite's built-in timestamp)
    const { documents } = await databases.listDocuments(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION_ID,
      [
        Query.equal('user_id', session.user.id),
        Query.orderDesc('$createdAt'),
        Query.limit(limit)
      ]
    );

    const notifications: Notification[] = documents.map((n: any) => ({
      id: n.$id,
      userId: n.user_id,
      type: n.type as NotificationType,
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      relatedId: n.related_id,
      relatedType: n.related_type,
      createdAt: n.$createdAt, // Use Appwrite's built-in timestamp
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
    const { databases } = await getAdminClient();
    
    // Use limit(1) and select minimal fields, then use total for count
    const { total } = await databases.listDocuments(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION_ID,
      [
        Query.equal('user_id', session.user.id),
        Query.equal('is_read', false),
        Query.select(['$id']),
        Query.limit(1)
      ]
    );

    return { count: total };
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
    const { databases } = await getAdminClient();
    
    // Note: Appwrite automatically handles $createdAt and $updatedAt
    // Do NOT include created_at as it's not a schema attribute
    await databases.createDocument(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION_ID,
      ID.unique(),
      {
        user_id: userId,
        type,
        title,
        message,
        is_read: false,
        related_id: relatedId || null,
        related_type: relatedType || null,
      }
    );

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
    const { databases } = await getAdminClient();
    
    // Verify ownership
    const notification = await databases.getDocument(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION_ID,
      notificationId
    );
    
    if (notification.user_id !== session.user.id) {
      return { error: 'Unauthorized' };
    }
    
    await databases.updateDocument(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION_ID,
      notificationId,
      { is_read: true }
    );

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
    const { databases } = await getAdminClient();
    
    // Don't use cursor-based pagination when modifying documents
    // Instead, keep fetching until no more unread documents
    let processedCount = 0;
    const maxIterations = 100; // Safety limit
    let iterations = 0;
    
    while (iterations < maxIterations) {
        iterations++;
        
        const { documents } = await databases.listDocuments(
            DATABASE_ID, 
            NOTIFICATIONS_COLLECTION_ID, 
            [
                Query.equal('user_id', session.user.id),
                Query.equal('is_read', false),
                Query.limit(100)
            ]
        );
        
        if (documents.length === 0) break;
        
        await Promise.all(documents.map(doc => 
            databases.updateDocument(
                DATABASE_ID, 
                NOTIFICATIONS_COLLECTION_ID, 
                doc.$id, 
                { is_read: true }
            )
        ));
        
        processedCount += documents.length;
    }

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
    const { databases } = await getAdminClient();
    
    // Verify ownership
    const notification = await databases.getDocument(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION_ID,
      notificationId
    );
    
    if (notification.user_id !== session.user.id) {
      return { error: 'Unauthorized' };
    }
    
    await databases.deleteDocument(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION_ID,
      notificationId
    );

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
    const { databases } = await getAdminClient();
    
    // Don't use cursor-based pagination when deleting documents
    // The cursor document gets deleted, causing "cursor not found" errors
    // Instead, keep fetching the first batch until no more documents
    let processedCount = 0;
    const maxIterations = 100; // Safety limit
    let iterations = 0;
    
    while (iterations < maxIterations) {
        iterations++;
        
        const { documents } = await databases.listDocuments(
            DATABASE_ID, 
            NOTIFICATIONS_COLLECTION_ID, 
            [
                Query.equal('user_id', session.user.id),
                Query.limit(100)
            ]
        );
        
        if (documents.length === 0) break;
        
        await Promise.all(documents.map(doc => 
            databases.deleteDocument(
                DATABASE_ID, 
                NOTIFICATIONS_COLLECTION_ID, 
                doc.$id
            )
        ));
        
        processedCount += documents.length;
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to clear notifications:', e);
    return { error: 'Failed to clear notifications' };
  }
}

