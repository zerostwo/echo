/**
 * Migration: Add missing fields to Appwrite schema
 * 
 * This migration adds:
 * 1. deleted_at to user_word_statuses (for soft delete)
 * 2. recording_file_id to practice_progress (for audio recordings)
 * 3. Missing word metadata fields (collins, oxford, tag, bnc, frq, exchange, audio, detail)
 * 4. Indexes for deleted_at fields
 * 
 * Run with: node migrations/appwrite/001_add_missing_fields.js
 */

const { Client, Databases } = require('node-appwrite');
const fs = require('fs');
const path = require('path');

// Load .env manually
try {
    const envPath = path.resolve(__dirname, '../../.env');
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
    console.error('Required: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
    process.exit(1);
}

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);

/**
 * Helper to create attribute with retry
 */
async function createAttributeSafe(collectionId, attributeConfig) {
    const { key, type, ...config } = attributeConfig;
    console.log(`  Creating ${type} attribute: ${key}...`);
    
    try {
        switch (type) {
            case 'string':
                await databases.createStringAttribute(
                    DATABASE_ID, 
                    collectionId, 
                    key, 
                    config.size || 255, 
                    config.required || false, 
                    config.default
                );
                break;
            case 'datetime':
                await databases.createDatetimeAttribute(
                    DATABASE_ID, 
                    collectionId, 
                    key, 
                    config.required || false, 
                    config.default
                );
                break;
            case 'integer':
                await databases.createIntegerAttribute(
                    DATABASE_ID, 
                    collectionId, 
                    key, 
                    config.required || false, 
                    config.min, 
                    config.max, 
                    config.default
                );
                break;
            case 'boolean':
                await databases.createBooleanAttribute(
                    DATABASE_ID, 
                    collectionId, 
                    key, 
                    config.required || false, 
                    config.default
                );
                break;
            case 'double':
                await databases.createFloatAttribute(
                    DATABASE_ID, 
                    collectionId, 
                    key, 
                    config.required || false, 
                    config.min, 
                    config.max, 
                    config.default
                );
                break;
            default:
                console.error(`    Unknown type: ${type}`);
                return false;
        }
        console.log(`    ✓ Created ${key}`);
        return true;
    } catch (e) {
        if (e.code === 409) {
            console.log(`    → ${key} already exists (skipping)`);
            return true;
        }
        console.error(`    ✗ Error creating ${key}: ${e.message}`);
        return false;
    }
}

/**
 * Helper to create index with retry
 */
async function createIndexSafe(collectionId, indexConfig) {
    const { key, type, attributes, orders } = indexConfig;
    console.log(`  Creating ${type} index: ${key}...`);
    
    try {
        await databases.createIndex(
            DATABASE_ID, 
            collectionId, 
            key, 
            type, 
            attributes,
            orders
        );
        console.log(`    ✓ Created index ${key}`);
        return true;
    } catch (e) {
        if (e.code === 409) {
            console.log(`    → Index ${key} already exists (skipping)`);
            return true;
        }
        console.error(`    ✗ Error creating index ${key}: ${e.message}`);
        return false;
    }
}

/**
 * Wait for attribute to be available
 */
async function waitForAttribute(collectionId, attributeKey, maxWait = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        try {
            const attribute = await databases.getAttribute(DATABASE_ID, collectionId, attributeKey);
            if (attribute.status === 'available') {
                return true;
            }
            if (attribute.status === 'failed') {
                console.error(`    ✗ Attribute ${attributeKey} failed to create`);
                return false;
            }
        } catch (e) {
            // Attribute might not exist yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.error(`    ✗ Timeout waiting for attribute ${attributeKey}`);
    return false;
}

async function migrate() {
    console.log('===========================================');
    console.log('Migration: 001_add_missing_fields');
    console.log('===========================================');
    console.log(`Database: ${DATABASE_ID}`);
    console.log(`Endpoint: ${ENDPOINT}`);
    console.log('');

    let success = true;

    // =========================================================================
    // 1. Add deleted_at to user_word_statuses
    // =========================================================================
    console.log('1. Adding deleted_at to user_word_statuses...');
    
    const deletedAtResult = await createAttributeSafe('user_word_statuses', {
        key: 'deleted_at',
        type: 'datetime',
        required: false,
        default: null
    });
    
    if (deletedAtResult) {
        // Wait for attribute to be available before creating index
        console.log('   Waiting for attribute to be available...');
        const available = await waitForAttribute('user_word_statuses', 'deleted_at');
        
        if (available) {
            // Create index for user_id + deleted_at
            await createIndexSafe('user_word_statuses', {
                key: 'user_deleted_idx',
                type: 'key',
                attributes: ['user_id', 'deleted_at']
            });
        }
    } else {
        success = false;
    }
    console.log('');

    // =========================================================================
    // 2. Add recording_file_id to practice_progress
    // =========================================================================
    console.log('2. Adding recording_file_id to practice_progress...');
    
    const recordingResult = await createAttributeSafe('practice_progress', {
        key: 'recording_file_id',
        type: 'string',
        size: 255,
        required: false,
        default: null
    });
    
    if (!recordingResult) {
        success = false;
    }
    console.log('');

    // =========================================================================
    // 3. Add missing word metadata fields
    // =========================================================================
    console.log('3. Adding missing word metadata fields to words...');

    const wordFields = [
        { key: 'collins', type: 'integer', required: false },
        { key: 'oxford', type: 'integer', required: false },
        { key: 'tag', type: 'string', required: false, size: 255 },
        { key: 'bnc', type: 'integer', required: false },
        { key: 'frq', type: 'integer', required: false },
        { key: 'exchange', type: 'string', required: false, size: 1000 },
        { key: 'audio', type: 'string', required: false, size: 1000 },
        { key: 'detail', type: 'string', required: false, size: 5000 },
    ];

    for (const field of wordFields) {
        const ok = await createAttributeSafe('words', field);
        if (!ok) success = false;
        await waitForAttribute('words', field.key);
    }
    console.log('');

    // =========================================================================
    // 4. Add word_relations collection if missing
    // =========================================================================
    console.log('4. Checking word_relations collection...');
    
    try {
        await databases.getCollection(DATABASE_ID, 'word_relations');
        console.log('   → word_relations collection exists');
    } catch (e) {
        if (e.code === 404) {
            console.log('   Creating word_relations collection...');
            try {
                await databases.createCollection(DATABASE_ID, 'word_relations', 'Word Relations', [], true);
                console.log('   ✓ Created word_relations collection');
                
                // Add attributes
                const relationAttributes = [
                    { key: 'word_id', type: 'string', size: 255, required: true },
                    { key: 'related_word_id', type: 'string', size: 255, required: false },
                    { key: 'custom_text', type: 'string', size: 255, required: false },
                    { key: 'relation_type', type: 'string', size: 50, required: true }
                ];
                
                for (const attr of relationAttributes) {
                    await createAttributeSafe('word_relations', attr);
                    await waitForAttribute('word_relations', attr.key);
                }
                
                // Add indexes
                await createIndexSafe('word_relations', {
                    key: 'word_idx',
                    type: 'key',
                    attributes: ['word_id']
                });
                
                await createIndexSafe('word_relations', {
                    key: 'related_word_idx',
                    type: 'key',
                    attributes: ['related_word_id']
                });
                
            } catch (createErr) {
                console.error('   ✗ Error creating word_relations:', createErr.message);
                success = false;
            }
        } else {
            console.error('   ✗ Error checking word_relations:', e.message);
        }
    }
    console.log('');

    // =========================================================================
    // 5. Add word_reviews collection if missing
    // =========================================================================
    console.log('5. Checking word_reviews collection...');
    
    try {
        await databases.getCollection(DATABASE_ID, 'word_reviews');
        console.log('   → word_reviews collection exists');
    } catch (e) {
        if (e.code === 404) {
            console.log('   Creating word_reviews collection...');
            try {
                await databases.createCollection(DATABASE_ID, 'word_reviews', 'Word Reviews', [], true);
                console.log('   ✓ Created word_reviews collection');
                
                // Add attributes
                const reviewAttributes = [
                    { key: 'user_word_status_id', type: 'string', size: 255, required: true },
                    { key: 'rating', type: 'integer', required: true },
                    { key: 'mode', type: 'string', size: 50, required: true },
                    { key: 'response_time_ms', type: 'integer', required: true },
                    { key: 'was_correct', type: 'boolean', required: true },
                    { key: 'error_count', type: 'integer', required: false, default: 0 },
                    { key: 'new_stability', type: 'double', required: false },
                    { key: 'new_difficulty', type: 'double', required: false },
                    { key: 'new_due', type: 'datetime', required: false }
                ];
                
                for (const attr of reviewAttributes) {
                    await createAttributeSafe('word_reviews', attr);
                    await waitForAttribute('word_reviews', attr.key);
                }
                
                // Add index
                await createIndexSafe('word_reviews', {
                    key: 'status_idx',
                    type: 'key',
                    attributes: ['user_word_status_id']
                });
                
            } catch (createErr) {
                console.error('   ✗ Error creating word_reviews:', createErr.message);
                success = false;
            }
        } else {
            console.error('   ✗ Error checking word_reviews:', e.message);
        }
    }
    console.log('');

    // =========================================================================
    // 5. Add recordings bucket if missing
    // =========================================================================
    console.log('5. Checking recordings bucket...');
    const { Storage } = require('node-appwrite');
    const storage = new Storage(client);
    
    try {
        await storage.getBucket('recordings');
        console.log('   → recordings bucket exists');
    } catch (e) {
        if (e.code === 404) {
            console.log('   Creating recordings bucket...');
            try {
                await storage.createBucket(
                    'recordings',
                    'User Recordings',
                    [],      // permissions
                    true,    // fileSecurity
                    true,    // enabled
                    52428800 // max file size (50MB)
                );
                console.log('   ✓ Created recordings bucket');
            } catch (createErr) {
                console.error('   ✗ Error creating recordings bucket:', createErr.message);
                success = false;
            }
        } else {
            console.error('   ✗ Error checking recordings bucket:', e.message);
        }
    }
    console.log('');

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('===========================================');
    if (success) {
        console.log('Migration completed successfully! ✓');
    } else {
        console.log('Migration completed with errors. Please check the output above.');
        process.exit(1);
    }
    console.log('===========================================');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
