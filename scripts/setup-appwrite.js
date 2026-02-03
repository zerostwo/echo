const { Client, Databases, Storage, ID, Permission, Role } = require('node-appwrite');

// Configuration
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'echo_db';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
    console.error('Error: Missing Appwrite configuration. Please set NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, and APPWRITE_API_KEY in your .env file.');
    process.exit(1);
}

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);
const storage = new Storage(client);

const COLLECTIONS = [
    {
        id: 'users',
        name: 'Users',
        attributes: [
            { key: 'username', type: 'string', size: 255, required: false },
            { key: 'display_name', type: 'string', size: 255, required: false },
            { key: 'email', type: 'string', size: 255, required: true },
            { key: 'image', type: 'string', size: 1024, required: false },
            { key: 'role', type: 'string', size: 50, required: false, default: 'USER' },
            { key: 'is_active', type: 'boolean', required: false, default: true },
            { key: 'quota', type: 'integer', required: false, default: 10737418240 }, // 10GB
            { key: 'used_space', type: 'integer', required: false, default: 0 },
            { key: 'settings', type: 'string', size: 10000, required: false, default: '{}' },
            { key: 'two_factor_enabled', type: 'boolean', required: false, default: false },
            { key: 'email_verified', type: 'datetime', required: false },
        ],
        indexes: [
            { key: 'email_idx', type: 'unique', attributes: ['email'] },
            { key: 'username_idx', type: 'unique', attributes: ['username'] }
        ]
    },
    {
        id: 'folders',
        name: 'Folders',
        attributes: [
            { key: 'name', type: 'string', size: 255, required: true },
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'parent_id', type: 'string', size: 255, required: false },
            { key: 'order', type: 'integer', required: false, default: 0 },
            { key: 'deleted_at', type: 'datetime', required: false }
        ],
        indexes: [
            { key: 'user_parent_idx', type: 'key', attributes: ['user_id', 'parent_id'] }
        ]
    },
    {
        id: 'materials',
        name: 'Materials',
        attributes: [
            { key: 'title', type: 'string', size: 255, required: true },
            { key: 'filename', type: 'string', size: 255, required: true },
            { key: 'file_path', type: 'string', size: 1024, required: true }, // File ID or URL
            { key: 'mime_type', type: 'string', size: 100, required: false },
            { key: 'size', type: 'integer', required: true },
            { key: 'duration', type: 'double', required: false },
            { key: 'folder_id', type: 'string', size: 255, required: false },
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'is_processed', type: 'boolean', required: false, default: false },
            { key: 'transcription_engine', type: 'string', size: 50, required: false },
            { key: 'transcription_model', type: 'string', size: 50, required: false },
            { key: 'transcription_language', type: 'string', size: 10, required: false },
            { key: 'transcription_time', type: 'double', required: false },
            { key: 'deleted_at', type: 'datetime', required: false },
            { key: 'updated_at', type: 'datetime', required: false } // Manual tracking if needed
        ],
        indexes: [
            { key: 'user_folder_idx', type: 'key', attributes: ['user_id', 'folder_id'] },
            { key: 'title_search', type: 'fulltext', attributes: ['title'] }
        ]
    },
    {
        id: 'sentences',
        name: 'Sentences',
        attributes: [
            { key: 'material_id', type: 'string', size: 255, required: true },
            { key: 'start_time', type: 'double', required: true },
            { key: 'end_time', type: 'double', required: true },
            { key: 'content', type: 'string', size: 10000, required: true },
            { key: 'edited_content', type: 'string', size: 10000, required: false },
            { key: 'order', type: 'integer', required: true },
            { key: 'deleted_at', type: 'datetime', required: false }
        ],
        indexes: [
            { key: 'material_idx', type: 'key', attributes: ['material_id'] }
        ]
    },
    {
        id: 'words',
        name: 'Words',
        attributes: [
            { key: 'text', type: 'string', size: 255, required: true },
            { key: 'language', type: 'string', size: 10, required: false, default: 'en' },
            { key: 'phonetic', type: 'string', size: 255, required: false },
            { key: 'pos', type: 'string', size: 50, required: false },
            { key: 'translation', type: 'string', size: 1000, required: false },
            { key: 'definition', type: 'string', size: 5000, required: false },
            { key: 'collins', type: 'integer', required: false },
            { key: 'oxford', type: 'integer', required: false },
            { key: 'tag', type: 'string', size: 255, required: false },
            { key: 'bnc', type: 'integer', required: false },
            { key: 'frq', type: 'integer', required: false },
            { key: 'exchange', type: 'string', size: 1000, required: false },
            { key: 'audio', type: 'string', size: 1000, required: false },
            { key: 'detail', type: 'string', size: 5000, required: false },
            { key: 'deleted_at', type: 'datetime', required: false }
        ],
        indexes: [
            { key: 'text_idx', type: 'unique', attributes: ['text'] }
        ]
    },
    {
        id: 'word_occurrences',
        name: 'Word Occurrences',
        attributes: [
            { key: 'word_id', type: 'string', size: 255, required: true },
            { key: 'sentence_id', type: 'string', size: 255, required: true },
            { key: 'start_index', type: 'integer', required: false },
            { key: 'end_index', type: 'integer', required: false }
        ],
        indexes: [
            { key: 'sentence_idx', type: 'key', attributes: ['sentence_id'] },
            { key: 'word_idx', type: 'key', attributes: ['word_id'] }
        ]
    },
    {
        id: 'user_word_statuses',
        name: 'User Word Statuses',
        attributes: [
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'word_id', type: 'string', size: 255, required: true },
            { key: 'status', type: 'string', size: 50, required: false, default: 'UNKNOWN' },
            { key: 'fsrs_due', type: 'datetime', required: false },
            { key: 'fsrs_stability', type: 'double', required: false },
            { key: 'fsrs_difficulty', type: 'double', required: false },
            { key: 'fsrs_elapsed_days', type: 'integer', required: false, default: 0 },
            { key: 'fsrs_scheduled_days', type: 'integer', required: false, default: 0 },
            { key: 'fsrs_reps', type: 'integer', required: false, default: 0 },
            { key: 'fsrs_lapses', type: 'integer', required: false, default: 0 },
            { key: 'fsrs_state', type: 'integer', required: false, default: 0 },
            { key: 'fsrs_last_review', type: 'datetime', required: false },
            { key: 'error_count', type: 'integer', required: false, default: 0 },
            { key: 'last_error_at', type: 'datetime', required: false },
            { key: 'deleted_at', type: 'datetime', required: false } // For soft delete
        ],
        indexes: [
            { key: 'user_word_idx', type: 'key', attributes: ['user_id', 'word_id'] }, // Should be unique logically
            { key: 'user_status_idx', type: 'key', attributes: ['user_id', 'status'] },
            { key: 'user_due_idx', type: 'key', attributes: ['user_id', 'fsrs_due'] },
            { key: 'user_deleted_idx', type: 'key', attributes: ['user_id', 'deleted_at'] } // For trash queries
        ]
    },
    {
        id: 'practice_progress',
        name: 'Practice Progress',
        attributes: [
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'sentence_id', type: 'string', size: 255, required: true },
            { key: 'score', type: 'integer', required: true },
            { key: 'attempts', type: 'integer', required: false, default: 1 },
            { key: 'duration', type: 'integer', required: false, default: 0 },
            { key: 'recording_file_id', type: 'string', size: 255, required: false } // For user recordings
        ],
        indexes: [
            { key: 'user_sentence_idx', type: 'key', attributes: ['user_id', 'sentence_id'] }
        ]
    },
    {
        id: 'daily_study_stats',
        name: 'Daily Study Stats',
        attributes: [
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'date', type: 'string', size: 50, required: true }, // ISO Date string YYYY-MM-DD or ISO timestamp
            { key: 'study_duration', type: 'integer', required: false, default: 0 },
            { key: 'words_added', type: 'integer', required: false, default: 0 },
            { key: 'sentences_added', type: 'integer', required: false, default: 0 },
            { key: 'words_reviewed', type: 'integer', required: false, default: 0 } // Added this as it was used in dashboard
        ],
        indexes: [
            { key: 'user_date_idx', type: 'key', attributes: ['user_id', 'date'] }
        ]
    },
    {
        id: 'notifications',
        name: 'Notifications',
        attributes: [
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'type', type: 'string', size: 50, required: true },
            { key: 'title', type: 'string', size: 255, required: true },
            { key: 'message', type: 'string', size: 1000, required: true },
            { key: 'is_read', type: 'boolean', required: false, default: false },
            { key: 'related_id', type: 'string', size: 255, required: false },
            { key: 'related_type', type: 'string', size: 50, required: false }
        ],
        indexes: [
            { key: 'user_read_idx', type: 'key', attributes: ['user_id', 'is_read'] }
        ]
    },
    {
        id: 'export_jobs',
        name: 'Export Jobs',
        attributes: [
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'options', type: 'string', size: 5000, required: true },
            { key: 'status', type: 'string', size: 50, required: true },
            { key: 'file_path', type: 'string', size: 1024, required: false },
            { key: 'error', type: 'string', size: 5000, required: false }
        ],
        indexes: [
            { key: 'user_idx', type: 'key', attributes: ['user_id'] }
        ]
    },
    {
        id: 'import_jobs',
        name: 'Import Jobs',
        attributes: [
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'status', type: 'string', size: 50, required: true },
            { key: 'file_path', type: 'string', size: 1024, required: false },
            { key: 'error', type: 'string', size: 5000, required: false }
        ],
        indexes: [
            { key: 'user_idx', type: 'key', attributes: ['user_id'] }
        ]
    },
    {
        id: 'dictionaries',
        name: 'Dictionaries',
        attributes: [
            { key: 'name', type: 'string', size: 255, required: true },
            { key: 'description', type: 'string', size: 1000, required: false },
            { key: 'is_system', type: 'boolean', required: false, default: false },
            { key: 'filter', type: 'string', size: 5000, required: false },
            { key: 'user_id', type: 'string', size: 255, required: true },
            { key: 'created_at', type: 'datetime', required: false },
            { key: 'updated_at', type: 'datetime', required: false },
            { key: 'deleted_at', type: 'datetime', required: false }
        ],
        indexes: [
            { key: 'user_idx', type: 'key', attributes: ['user_id'] },
            { key: 'name_search', type: 'fulltext', attributes: ['name'] }
        ]
    },
    {
        id: 'dictionary_words',
        name: 'Dictionary Words',
        attributes: [
            { key: 'dictionary_id', type: 'string', size: 255, required: true },
            { key: 'word_id', type: 'string', size: 255, required: true },
            { key: 'added_at', type: 'datetime', required: false }
        ],
        indexes: [
            { key: 'dictionary_idx', type: 'key', attributes: ['dictionary_id'] },
            { key: 'word_idx', type: 'key', attributes: ['word_id'] },
            { key: 'dict_word_idx', type: 'key', attributes: ['dictionary_id', 'word_id'] }
        ]
    },
    {
        id: 'word_relations',
        name: 'Word Relations',
        attributes: [
            { key: 'word_id', type: 'string', size: 255, required: true },
            { key: 'related_word_id', type: 'string', size: 255, required: false },
            { key: 'custom_text', type: 'string', size: 255, required: false },
            { key: 'relation_type', type: 'string', size: 50, required: true }
        ],
        indexes: [
            { key: 'word_idx', type: 'key', attributes: ['word_id'] },
            { key: 'related_word_idx', type: 'key', attributes: ['related_word_id'] }
        ]
    },
    {
        id: 'word_reviews',
        name: 'Word Reviews',
        attributes: [
            { key: 'user_word_status_id', type: 'string', size: 255, required: true },
            { key: 'rating', type: 'integer', required: true },
            { key: 'mode', type: 'string', size: 50, required: true },
            { key: 'response_time_ms', type: 'integer', required: true },
            { key: 'was_correct', type: 'boolean', required: true },
            { key: 'error_count', type: 'integer', required: false, default: 0 },
            { key: 'new_stability', type: 'double', required: false },
            { key: 'new_difficulty', type: 'double', required: false },
            { key: 'new_due', type: 'datetime', required: false }
        ],
        indexes: [
            { key: 'status_idx', type: 'key', attributes: ['user_word_status_id'] }
        ]
    }
];

const BUCKETS = [
    { id: 'materials', name: 'Materials', fileSecurity: true },
    { id: 'avatars', name: 'Avatars', fileSecurity: false }, // Public avatars usually
    { id: 'exports', name: 'Exports', fileSecurity: true },
    { id: 'recordings', name: 'User Recordings', fileSecurity: true } // For user audio recordings
];

async function setup() {
    console.log('Starting Appwrite Setup...');

    // 1. Create Database
    try {
        await databases.get(DATABASE_ID);
        console.log();
    } catch (e) {
        if (e.code === 404) {
            console.log();
            await databases.create(DATABASE_ID, 'EchoDB');
        } else {
            throw e;
        }
    }

    // 2. Create Collections & Attributes
    for (const col of COLLECTIONS) {
        try {
            await databases.getCollection(DATABASE_ID, col.id);
            console.log();
        } catch (e) {
            if (e.code === 404) {
                console.log();
                await databases.createCollection(DATABASE_ID, col.id, col.name, [], true); // Document Security enabled
            } else {
                throw e;
            }
        }

        // Attributes
        for (const attr of col.attributes) {
            try {
                // Check if attribute exists (listAttributes)
                // But listAttributes returns a list. We can just try to create and ignore 409 (Conflict)
                // Or we can fetch list first.
                // Creating directly is easier if we handle error.
                
                if (attr.type === 'string') {
                    await databases.createStringAttribute(DATABASE_ID, col.id, attr.key, attr.size || 255, attr.required, attr.default);
                } else if (attr.type === 'integer') {
                    await databases.createIntegerAttribute(DATABASE_ID, col.id, attr.key, attr.required, null, null, attr.default);
                } else if (attr.type === 'boolean') {
                    await databases.createBooleanAttribute(DATABASE_ID, col.id, attr.key, attr.required, attr.default);
                } else if (attr.type === 'double') {
                    await databases.createFloatAttribute(DATABASE_ID, col.id, attr.key, attr.required, null, null, attr.default);
                } else if (attr.type === 'datetime') {
                    await databases.createDatetimeAttribute(DATABASE_ID, col.id, attr.key, attr.required, attr.default);
                } else if (attr.type === 'email') {
                    await databases.createEmailAttribute(DATABASE_ID, col.id, attr.key, attr.required, attr.default);
                } else if (attr.type === 'url') {
                    await databases.createUrlAttribute(DATABASE_ID, col.id, attr.key, attr.required, attr.default);
                } else if (attr.type === 'enum') {
                    await databases.createEnumAttribute(DATABASE_ID, col.id, attr.key, attr.elements, attr.required, attr.default);
                }
                console.log();
            } catch (e) {
                if (e.code === 409) {
                    // console.log();
                } else {
                    console.error('Error creating attribute:', e.message);
                }
            }
        }
        
        // Wait a bit for attributes to be available before creating indexes?
        // Appwrite handles this async usually.
        // But we can try creating indexes.
        
        // Indexes
        if (col.indexes) {
            // We need to wait for attributes to be 'available' status.
            // For simplicity in this script, we might fail if attributes are processing.
            // We'll try to create indexes and log warning if it fails.
            
            // Sleep 2 seconds to give a chance
            await new Promise(r => setTimeout(r, 2000));

            for (const idx of col.indexes) {
                try {
                    await databases.createIndex(DATABASE_ID, col.id, idx.key, idx.type, idx.attributes);
                    console.log();
                } catch (e) {
                    if (e.code === 409) {
                        // console.log();
                    } else {
                        console.warn('Warning creating index:', e.message);
                    }
                }
            }
        }
    }

    // 3. Create Buckets
    for (const bucket of BUCKETS) {
        try {
            await storage.getBucket(bucket.id);
            console.log();
        } catch (e) {
            if (e.code === 404) {
                console.log();
                await storage.createBucket(bucket.id, bucket.name, [], bucket.fileSecurity, true);
            } else {
                throw e;
            }
        }
    }

    console.log('Setup complete!');
}

setup().catch(console.error);
