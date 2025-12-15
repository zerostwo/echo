import { createSessionClient as createClient } from './appwrite';

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'echo_db';
export const DATABASE_IDS = {
    main: DATABASE_ID
};

export const MATERIALS_COLLECTION_ID = 'materials';
export const SENTENCES_COLLECTION_ID = 'sentences';
export const WORDS_COLLECTION_ID = 'words';
export const WORD_OCCURRENCES_COLLECTION_ID = 'word_occurrences';
export const PRACTICE_PROGRESS_COLLECTION_ID = 'practice_progress';
export const USER_WORD_STATUSES_COLLECTION_ID = 'user_word_statuses';
export const DICTIONARIES_COLLECTION_ID = 'dictionaries';
export const FOLDERS_COLLECTION_ID = 'folders';
export const DAILY_STUDY_STATS_COLLECTION_ID = 'daily_study_stats';

export const COLLECTION_IDS = {
    materials: MATERIALS_COLLECTION_ID,
    sentences: SENTENCES_COLLECTION_ID,
    words: WORDS_COLLECTION_ID,
    word_occurrences: WORD_OCCURRENCES_COLLECTION_ID,
    practice_progress: PRACTICE_PROGRESS_COLLECTION_ID,
    user_word_statuses: USER_WORD_STATUSES_COLLECTION_ID,
    dictionaries: DICTIONARIES_COLLECTION_ID,
    folders: FOLDERS_COLLECTION_ID,
    daily_study_stats: DAILY_STUDY_STATS_COLLECTION_ID
};

export { createClient as createSessionClient };
