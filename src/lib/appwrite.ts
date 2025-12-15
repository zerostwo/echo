import { Client, Account, Databases, Storage } from 'appwrite';
import { Client as NodeClient, Databases as NodeDatabases, Storage as NodeStorage, Users as NodeUsers, Query } from 'node-appwrite';
import { cookies } from 'next/headers';

// Client-side SDK (for public access)
export const client = new Client();
client
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// Server-side SDK (for admin access)
export const createAdminClient = () => {
    const client = new NodeClient();
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !projectId || !apiKey) {
        return null;
    }

    client
        .setEndpoint(endpoint)
        .setProject(projectId)
        .setKey(apiKey);

    return {
        get account() { return new Account(client as any); }, // Account is not usually available in node-appwrite in the same way, but Users is.
        get users() { return new NodeUsers(client); },
        get databases() { return new NodeDatabases(client); },
        get storage() { return new NodeStorage(client); }
    };
};

export async function createSessionClient() {
    const client = new NodeClient();
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

    if (!endpoint || !projectId) {
        throw new Error('Appwrite configuration missing');
    }

    client
        .setEndpoint(endpoint)
        .setProject(projectId);

    const session = (await cookies()).get('appwrite-session');
    if (!session || !session.value) {
        // Return a client without session (anonymous) or throw?
        // Usually we want to throw or return null if auth is required.
        // But for some public reads it might be fine.
        // However, most actions require auth.
        // Let's return a client that might fail on protected resources.
        // But setSession requires a string.
        // If no session, we can't set it.
        return {
            get account() { return new Account(client as any); },
            get databases() { return new NodeDatabases(client); }
        };
    }

    client.setSession(session.value);

    return {
        get account() { return new Account(client as any); },
        get databases() { return new NodeDatabases(client); }
    };
}

// Helper to get the admin client or throw
export const getAdminClient = () => {
    const admin = createAdminClient();
    if (!admin) {
        throw new Error('Appwrite Admin Client configuration missing (Endpoint, Project ID, or API Key)');
    }
    return admin;
};

export const APPWRITE_DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'echo_db';
export { Query };
