const { Client, Databases } = require('node-appwrite');
const fs = require('fs');
const path = require('path');

// Load .env manually
try {
    const envPath = path.resolve(__dirname, '../.env');
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    });
} catch (e) {
    console.warn('Could not load .env file', e);
}

// Configuration
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'echo_db';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
    console.error('Error: Missing Appwrite configuration.');
    process.exit(1);
}

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);

async function updateSchema() {
    console.log('Updating Appwrite Schema...');

    try {
        // 1. Add verification_token to users
        console.log('Adding verification_token to users...');
        try {
            await databases.createStringAttribute(DATABASE_ID, 'users', 'verification_token', 255, false);
            console.log('Created verification_token attribute.');
        } catch (e) {
            if (e.code === 409) console.log('verification_token already exists.');
            else console.error('Error creating verification_token:', e.message);
        }

        // 2. Add updated_at to users
        console.log('Adding updated_at to users...');
        try {
            await databases.createDatetimeAttribute(DATABASE_ID, 'users', 'updated_at', false);
            console.log('Created updated_at attribute.');
        } catch (e) {
            if (e.code === 409) console.log('updated_at already exists.');
            else console.error('Error creating updated_at:', e.message);
        }

        // 3. Add password to users (for NextAuth CredentialsProvider)
        console.log('Adding password to users...');
        try {
            await databases.createStringAttribute(DATABASE_ID, 'users', 'password', 255, false);
            console.log('Created password attribute.');
        } catch (e) {
            if (e.code === 409) console.log('password already exists.');
            else console.error('Error creating password:', e.message);
        }

        // 4. Add reset_token to users
        console.log('Adding reset_token to users...');
        try {
            await databases.createStringAttribute(DATABASE_ID, 'users', 'reset_token', 255, false);
            console.log('Created reset_token attribute.');
        } catch (e) {
            if (e.code === 409) console.log('reset_token already exists.');
            else console.error('Error creating reset_token:', e.message);
        }

        // 5. Add reset_token_expiry to users
        console.log('Adding reset_token_expiry to users...');
        try {
            await databases.createDatetimeAttribute(DATABASE_ID, 'users', 'reset_token_expiry', false);
            console.log('Created reset_token_expiry attribute.');
        } catch (e) {
            if (e.code === 409) console.log('reset_token_expiry already exists.');
            else console.error('Error creating reset_token_expiry:', e.message);
        }

        console.log('Schema update complete. Please wait a few seconds for attributes to be available.');

    } catch (error) {
        console.error('Schema update failed:', error);
    }
}

updateSchema();
