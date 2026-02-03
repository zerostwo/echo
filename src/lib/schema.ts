/**
 * Centralized Appwrite Schema Constants
 * 
 * This file defines all collection IDs, attribute names, and types used across the application.
 * ALWAYS use these constants instead of hardcoded strings to prevent schema drift.
 * 
 * Schema Version: 1.1.0
 * Last Updated: 2026-02-02
 */

// =============================================================================
// Database Configuration
// =============================================================================

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'echo_db';

// =============================================================================
// Collection IDs
// =============================================================================

export const COLLECTIONS = {
  USERS: 'users',
  MATERIALS: 'materials',
  FOLDERS: 'folders',
  SENTENCES: 'sentences',
  WORDS: 'words',
  WORD_OCCURRENCES: 'word_occurrences',
  USER_WORD_STATUSES: 'user_word_statuses',
  WORD_REVIEWS: 'word_reviews',
  WORD_RELATIONS: 'word_relations',
  PRACTICE_PROGRESS: 'practice_progress',
  DAILY_STUDY_STATS: 'daily_study_stats',
  DICTIONARIES: 'dictionaries',
  DICTIONARY_WORDS: 'dictionary_words',
  NOTIFICATIONS: 'notifications',
  EXPORT_JOBS: 'export_jobs',
  IMPORT_JOBS: 'import_jobs',
} as const;

// =============================================================================
// Storage Bucket IDs
// =============================================================================

export const BUCKETS = {
  MATERIALS: 'materials',
  EXPORTS: 'exports',
  AVATARS: 'avatars',
  RECORDINGS: 'recordings',
} as const;

// =============================================================================
// Common Field Names (used across multiple collections)
// =============================================================================

export const COMMON_FIELDS = {
  // Soft delete
  DELETED_AT: 'deleted_at',
  
  // Ownership
  USER_ID: 'user_id',
  
  // Timestamps (auto-managed by Appwrite)
  CREATED_AT: '$createdAt',
  UPDATED_AT: '$updatedAt',
  
  // Custom timestamp (for manual tracking)
  UPDATED_AT_CUSTOM: 'updated_at',
} as const;

// =============================================================================
// Users Collection Fields
// =============================================================================

export const USER_FIELDS = {
  USERNAME: 'username',
  DISPLAY_NAME: 'display_name',
  EMAIL: 'email',
  PASSWORD: 'password',
  IMAGE: 'image',
  ROLE: 'role',
  IS_ACTIVE: 'is_active',
  QUOTA: 'quota',
  USED_SPACE: 'used_space',
  SETTINGS: 'settings',
  EMAIL_VERIFIED: 'email_verified',
  VERIFICATION_TOKEN: 'verification_token',
  TWO_FACTOR_ENABLED: 'two_factor_enabled',
  TWO_FACTOR_SECRET: 'two_factor_secret',
  RESET_TOKEN: 'reset_token',
  RESET_TOKEN_EXPIRY: 'reset_token_expiry',
} as const;

// =============================================================================
// Materials Collection Fields
// =============================================================================

export const MATERIAL_FIELDS = {
  TITLE: 'title',
  FILENAME: 'filename',
  FILE_PATH: 'file_path',
  MIME_TYPE: 'mime_type',
  SIZE: 'size',
  DURATION: 'duration',
  FOLDER_ID: 'folder_id',
  USER_ID: 'user_id',
  IS_PROCESSED: 'is_processed',
  TRANSCRIPTION_ENGINE: 'transcription_engine',
  TRANSCRIPTION_MODEL: 'transcription_model',
  TRANSCRIPTION_LANGUAGE: 'transcription_language',
  TRANSCRIPTION_VAD_FILTER: 'transcription_vad_filter',
  TRANSCRIPTION_COMPUTE_TYPE: 'transcription_compute_type',
  TRANSCRIPTION_TIME: 'transcription_time',
  VOCAB_EXTRACTION_TIME: 'vocab_extraction_time',
  DELETED_AT: 'deleted_at',
  UPDATED_AT: 'updated_at',
} as const;

// =============================================================================
// Folders Collection Fields
// =============================================================================

export const FOLDER_FIELDS = {
  NAME: 'name',
  USER_ID: 'user_id',
  PARENT_ID: 'parent_id',
  ORDER: 'order',
  DELETED_AT: 'deleted_at',
} as const;

// =============================================================================
// Sentences Collection Fields
// =============================================================================

export const SENTENCE_FIELDS = {
  MATERIAL_ID: 'material_id',
  CONTENT: 'content',
  EDITED_CONTENT: 'edited_content',
  START_TIME: 'start_time',
  END_TIME: 'end_time',
  ORDER: 'order',
  DELETED_AT: 'deleted_at',
} as const;

// =============================================================================
// Words Collection Fields
// =============================================================================

export const WORD_FIELDS = {
  TEXT: 'text',
  LANGUAGE: 'language',
  PHONETIC: 'phonetic',
  POS: 'pos',
  TRANSLATION: 'translation',
  DEFINITION: 'definition',
  COLLINS: 'collins',
  OXFORD: 'oxford',
  TAG: 'tag',
  BNC: 'bnc',
  FRQ: 'frq',
  EXCHANGE: 'exchange',
  AUDIO: 'audio',
  DETAIL: 'detail',
  DELETED_AT: 'deleted_at',
} as const;

// =============================================================================
// Word Occurrences Collection Fields
// =============================================================================

export const WORD_OCCURRENCE_FIELDS = {
  WORD_ID: 'word_id',
  SENTENCE_ID: 'sentence_id',
  START_INDEX: 'start_index',
  END_INDEX: 'end_index',
} as const;

// =============================================================================
// User Word Statuses Collection Fields
// =============================================================================

export const USER_WORD_STATUS_FIELDS = {
  USER_ID: 'user_id',
  WORD_ID: 'word_id',
  STATUS: 'status',
  
  // FSRS fields
  FSRS_DUE: 'fsrs_due',
  FSRS_STABILITY: 'fsrs_stability',
  FSRS_DIFFICULTY: 'fsrs_difficulty',
  FSRS_ELAPSED_DAYS: 'fsrs_elapsed_days',
  FSRS_SCHEDULED_DAYS: 'fsrs_scheduled_days',
  FSRS_REPS: 'fsrs_reps',
  FSRS_LAPSES: 'fsrs_lapses',
  FSRS_STATE: 'fsrs_state',
  FSRS_LAST_REVIEW: 'fsrs_last_review',
  
  // Error tracking
  ERROR_COUNT: 'error_count',
  LAST_ERROR_AT: 'last_error_at',
  
  // Soft delete (NEW - added in migration 001)
  DELETED_AT: 'deleted_at',
} as const;

// =============================================================================
// Word Reviews Collection Fields
// =============================================================================

export const WORD_REVIEW_FIELDS = {
  USER_WORD_STATUS_ID: 'user_word_status_id',
  RATING: 'rating',
  MODE: 'mode',
  RESPONSE_TIME_MS: 'response_time_ms',
  WAS_CORRECT: 'was_correct',
  ERROR_COUNT: 'error_count',
  NEW_STABILITY: 'new_stability',
  NEW_DIFFICULTY: 'new_difficulty',
  NEW_DUE: 'new_due',
} as const;

// =============================================================================
// Word Relations Collection Fields
// =============================================================================

export const WORD_RELATION_FIELDS = {
  WORD_ID: 'word_id',
  RELATED_WORD_ID: 'related_word_id',
  CUSTOM_TEXT: 'custom_text',
  RELATION_TYPE: 'relation_type',
} as const;

// =============================================================================
// Practice Progress Collection Fields
// =============================================================================

export const PRACTICE_PROGRESS_FIELDS = {
  USER_ID: 'user_id',
  SENTENCE_ID: 'sentence_id',
  SCORE: 'score',
  ATTEMPTS: 'attempts',
  DURATION: 'duration',
  // NEW - added in migration 001
  RECORDING_FILE_ID: 'recording_file_id',
} as const;

// =============================================================================
// Daily Study Stats Collection Fields
// =============================================================================

export const DAILY_STUDY_STATS_FIELDS = {
  USER_ID: 'user_id',
  DATE: 'date',
  STUDY_DURATION: 'study_duration',
  WORDS_ADDED: 'words_added',
  SENTENCES_ADDED: 'sentences_added',
  WORDS_REVIEWED: 'words_reviewed',
} as const;

// =============================================================================
// Dictionaries Collection Fields
// =============================================================================

export const DICTIONARY_FIELDS = {
  NAME: 'name',
  DESCRIPTION: 'description',
  USER_ID: 'user_id',
  IS_SYSTEM: 'is_system',
  FILTER: 'filter',
  DELETED_AT: 'deleted_at',
} as const;

// =============================================================================
// Dictionary Words Collection Fields
// =============================================================================

export const DICTIONARY_WORD_FIELDS = {
  DICTIONARY_ID: 'dictionary_id',
  WORD_ID: 'word_id',
  ADDED_AT: 'added_at',
} as const;

// =============================================================================
// Notifications Collection Fields
// =============================================================================

export const NOTIFICATION_FIELDS = {
  USER_ID: 'user_id',
  TYPE: 'type',
  TITLE: 'title',
  MESSAGE: 'message',
  IS_READ: 'is_read',
  RELATED_ID: 'related_id',
  RELATED_TYPE: 'related_type',
} as const;

// =============================================================================
// Export Jobs Collection Fields
// =============================================================================

export const EXPORT_JOB_FIELDS = {
  USER_ID: 'user_id',
  OPTIONS: 'options',
  STATUS: 'status',
  FILE_PATH: 'file_path',
  ERROR: 'error',
} as const;

// =============================================================================
// Import Jobs Collection Fields
// =============================================================================

export const IMPORT_JOB_FIELDS = {
  USER_ID: 'user_id',
  STATUS: 'status',
  FILE_PATH: 'file_path',
  ERROR: 'error',
} as const;

// =============================================================================
// Enums & Constants
// =============================================================================

export const WORD_STATUS = {
  NEW: 'NEW',
  LEARNING: 'LEARNING',
  MASTERED: 'MASTERED',
} as const;

export const FSRS_STATE = {
  NEW: 0,
  LEARNING: 1,
  REVIEW: 2,
  RELEARNING: 3,
} as const;

export const FSRS_RATING = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
} as const;

export const USER_ROLE = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

export const NOTIFICATION_TYPE = {
  MATERIAL_UPLOADED: 'MATERIAL_UPLOADED',
  MATERIAL_PROCESSED: 'MATERIAL_PROCESSED',
  VOCAB_EXTRACTED: 'VOCAB_EXTRACTED',
  PRACTICE_MILESTONE: 'PRACTICE_MILESTONE',
  SYSTEM: 'SYSTEM',
} as const;

export const JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  FINISHED: 'finished',
  FAILED: 'failed',
} as const;

export const RELATION_TYPE = {
  SYNONYM: 'SYNONYM',
  ANTONYM: 'ANTONYM',
  IDIOM: 'IDIOM',
  DERIVATIVE: 'DERIVATIVE',
} as const;

export const REVIEW_MODE = {
  TYPING: 'typing',
  MULTIPLE_CHOICE: 'multiple_choice',
  CONTEXT_LISTENING: 'context_listening',
} as const;

// =============================================================================
// Type Exports
// =============================================================================

export type WordStatus = typeof WORD_STATUS[keyof typeof WORD_STATUS];
export type FSRSState = typeof FSRS_STATE[keyof typeof FSRS_STATE];
export type FSRSRating = typeof FSRS_RATING[keyof typeof FSRS_RATING];
export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE];
export type NotificationType = typeof NOTIFICATION_TYPE[keyof typeof NOTIFICATION_TYPE];
export type JobStatus = typeof JOB_STATUS[keyof typeof JOB_STATUS];
export type RelationType = typeof RELATION_TYPE[keyof typeof RELATION_TYPE];
export type ReviewMode = typeof REVIEW_MODE[keyof typeof REVIEW_MODE];
export type CollectionId = typeof COLLECTIONS[keyof typeof COLLECTIONS];
export type BucketId = typeof BUCKETS[keyof typeof BUCKETS];
