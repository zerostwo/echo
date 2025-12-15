'use server';

import { getAdminClient } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';
import { Query } from 'node-appwrite';

export async function verifyEmail(token: string, newEmail?: string, type?: string) {
  const { databases, users } = await getAdminClient();

  try {
      const { documents } = await databases.listDocuments(
          DATABASE_ID,
          'users',
          [Query.equal('verification_token', token)]
      );

      const user = documents[0];

      if (!user) {
        return { error: 'Invalid or expired verification token.' };
      }

      // Handle email change verification
      if (type === 'change' && newEmail) {
        // Check if new email is still available
        const { total } = await databases.listDocuments(
            DATABASE_ID,
            'users',
            [Query.equal('email', newEmail)]
        );

        if (total > 0) {
          return { error: 'This email is already in use by another account.' };
        }

        // Update DB
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            user.$id,
            {
                email: newEmail,
                verification_token: null,
                updated_at: new Date().toISOString()
            }
        );
        
        // Update Auth
        await users.updateEmail(user.$id, newEmail);

        return { success: true, message: 'Email updated successfully!' };
      }

      // Regular email verification (registration)
      await databases.updateDocument(
          DATABASE_ID,
          'users',
          user.$id,
          {
              email_verified: new Date().toISOString(),
              verification_token: null,
              is_active: true
          }
      );
      
      // Update Auth verification status
      await users.updateEmailVerification(user.$id, true);

      return { success: true };
  } catch (e) {
      console.error('Verification error:', e);
      return { error: 'Failed to verify email.' };
  }
}

