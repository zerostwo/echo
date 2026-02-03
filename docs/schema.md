# Echo Database Schema

> **Database**: Appwrite Document Database  
> **Database ID**: `echo_db` (configurable via `NEXT_PUBLIC_APPWRITE_DATABASE_ID`)  
> **Last Updated**: February 2026

---

## Table of Contents

- [Overview](#overview)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Collections](#collections)
  - [users](#users)
  - [materials](#materials)
  - [folders](#folders)
  - [sentences](#sentences)
  - [words](#words)
  - [word_occurrences](#word_occurrences)
  - [user_word_statuses](#user_word_statuses)
  - [word_reviews](#word_reviews)
  - [word_relations](#word_relations)
  - [practice_progress](#practice_progress)
  - [daily_study_stats](#daily_study_stats)
  - [dictionaries](#dictionaries)
  - [dictionary_words](#dictionary_words)
  - [notifications](#notifications)
  - [export_jobs](#export_jobs)
  - [import_jobs](#import_jobs)
- [Enums & Constants](#enums--constants)
- [Indexes](#indexes)
- [Storage Buckets](#storage-buckets)

---

## Overview

Echo uses **Appwrite** as its database backend with 16 collections organized into these domains:

| Domain | Collections |
|--------|-------------|
| **User Management** | users |
| **Content** | materials, folders, sentences |
| **Vocabulary** | words, word_occurrences, word_relations |
| **Learning Progress** | user_word_statuses, word_reviews, practice_progress, daily_study_stats |
| **Organization** | dictionaries, dictionary_words |
| **System** | notifications, export_jobs, import_jobs |

### Key Design Decisions

1. **Soft Deletes**: Most entities use `deleted_at` timestamp instead of hard delete
2. **Global Words**: The `words` collection has no `user_id` - words are shared across all users
3. **User Ownership**: User-specific data linked via `user_id` foreign key
4. **FSRS Integration**: Learning progress uses FSRS algorithm fields for spaced repetition

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   USERS                                      │
│  $id, username, email, password, role, quota, used_space, settings...       │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌─────────────────┐           ┌─────────────────┐
│    FOLDERS    │           │    MATERIALS    │           │  DICTIONARIES   │
│ (self-ref)    │◄──────────│                 │           │                 │
└───────────────┘           └────────┬────────┘           └────────┬────────┘
                                     │                             │
                                     ▼                             ▼
                            ┌─────────────────┐           ┌─────────────────┐
                            │   SENTENCES     │           │ DICTIONARY_WORDS│
                            └────────┬────────┘           └────────┬────────┘
                                     │                             │
                                     ▼                             │
                            ┌─────────────────┐                    │
                            │WORD_OCCURRENCES │                    │
                            └────────┬────────┘                    │
                                     │                             │
                                     ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORDS (GLOBAL)                                  │
│  $id, text, phonetic, translation, definition, pos, collins, oxford...      │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
          ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
          │ WORD_RELATIONS  │ │USER_WORD_   │ │                 │
          │ (self-ref)      │ │STATUSES     │ │                 │
          └─────────────────┘ └──────┬──────┘ │                 │
                                     │        │                 │
                                     ▼        │                 │
                              ┌─────────────┐ │                 │
                              │WORD_REVIEWS │ │                 │
                              └─────────────┘ │                 │
                                              │                 │
┌─────────────────────────────────────────────┼─────────────────┘
│                                             │
│  Other User-Owned Collections:              │
│  ├── practice_progress (user_id, sentence_id)
│  ├── daily_study_stats (user_id, date)
│  ├── notifications (user_id)
│  ├── export_jobs (user_id)
│  └── import_jobs (user_id)
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Collections

### users

User accounts and authentication data.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `username` | string | no | - | Unique username (lowercase, alphanumeric) |
| `display_name` | string | no | - | Display name shown in UI |
| `email` | string | yes | - | Unique email address |
| `password` | string | yes | - | bcrypt hashed password |
| `image` | string | no | - | Avatar URL or Appwrite file ID |
| `role` | string | yes | "USER" | "ADMIN" or "USER" |
| `is_active` | boolean | yes | true | Account active status |
| `quota` | integer | yes | 10737418240 | Storage quota in bytes (default 10GB) |
| `used_space` | integer | yes | 0 | Used storage in bytes |
| `settings` | string | yes | "{}" | JSON string for user preferences |
| `email_verified` | datetime | no | - | Email verification timestamp |
| `verification_token` | string | no | - | Email verification token |
| `two_factor_enabled` | boolean | yes | false | 2FA enabled flag |
| `two_factor_secret` | string | no | - | TOTP secret for 2FA |
| `reset_token` | string | no | - | Password reset token |
| `reset_token_expiry` | datetime | no | - | Reset token expiration |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Settings JSON Structure:**
```json
{
  "whisperEngine": "faster-whisper",
  "whisperModel": "base",
  "whisperLanguage": "auto",
  "whisperVadFilter": true,
  "whisperComputeType": "auto",
  "whisperDevice": "auto",
  "theme": "system",
  "studyGoal": 20
}
```

---

### materials

Uploaded audio/video files for transcription.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `title` | string | yes | - | Display title |
| `filename` | string | yes | - | Original filename |
| `file_path` | string | yes | - | Appwrite Storage file ID or URL |
| `mime_type` | string | no | - | MIME type (audio/*, video/*) |
| `size` | integer | yes | - | File size in bytes |
| `duration` | float | no | - | Media duration in seconds |
| `folder_id` | string | no | null | FK to folders.$id |
| `user_id` | string | yes | - | FK to users.$id |
| `is_processed` | boolean | yes | false | Transcription complete flag |
| `transcription_engine` | string | no | - | "faster-whisper" or "openai-whisper" |
| `transcription_model` | string | no | - | Model name (tiny, base, small, etc.) |
| `transcription_language` | string | no | - | Detected/specified language code |
| `transcription_vad_filter` | boolean | no | - | VAD filter used |
| `transcription_compute_type` | string | no | - | Compute type (auto, float16, int8) |
| `transcription_time` | float | no | - | Processing duration in seconds |
| `vocab_extraction_time` | float | no | - | Vocabulary extraction duration |
| `deleted_at` | datetime | no | null | Soft delete timestamp |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Indexes:**
- `user_id` + `deleted_at` (for listing user's materials)
- `title` (for search)

---

### folders

Hierarchical folder organization for materials.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `name` | string | yes | - | Folder name |
| `user_id` | string | yes | - | FK to users.$id |
| `parent_id` | string | no | null | FK to folders.$id (self-referential) |
| `order` | integer | yes | 0 | Sort order within parent |
| `deleted_at` | datetime | no | null | Soft delete timestamp |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Indexes:**
- `user_id` + `parent_id` + `order` (for tree traversal)

---

### sentences

Transcription segments from materials.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `material_id` | string | yes | - | FK to materials.$id |
| `content` | string | yes | - | Original transcribed text |
| `edited_content` | string | no | null | User-edited text |
| `start_time` | float | yes | - | Start time in seconds |
| `end_time` | float | yes | - | End time in seconds |
| `order` | integer | yes | - | Sequential order |
| `deleted_at` | datetime | no | null | Soft delete timestamp |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Notes:**
- Display content = `edited_content ?? content`
- Sentences are CASCADE deleted when material is permanently deleted

**Indexes:**
- `material_id` + `deleted_at` (for listing)
- `content` (for search)

---

### words

Global dictionary of vocabulary words. **Shared across all users.**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `text` | string | yes | - | Word text (lowercase, unique) |
| `language` | string | yes | "en" | Language code |
| `phonetic` | string | no | - | IPA pronunciation |
| `pos` | string | no | - | Part of speech |
| `translation` | string | no | - | Chinese translation |
| `definition` | string | no | - | English definition |
| `collins` | integer | no | - | Collins star rating (1-5) |
| `oxford` | integer | no | - | Oxford 3000/5000 flag (1 = yes) |
| `tag` | string | no | - | Word tags (zk, gk, cet4, etc.) |
| `bnc` | integer | no | - | BNC frequency rank |
| `frq` | integer | no | - | COCA frequency rank |
| `exchange` | string | no | - | Word forms (p:past/d:pastParticiple/...) |
| `audio` | string | no | - | Audio pronunciation URL |
| `detail` | string | no | - | Extended JSON details |
| `deleted_at` | datetime | no | null | Soft delete timestamp |

**Exchange Format:**
```
p:walked/d:walked/i:walking/3:walks/s:walks/r:more/t:most
```
- `p:` past tense
- `d:` past participle
- `i:` present participle
- `3:` third person singular
- `s:` plural
- `r:` comparative
- `t:` superlative

**Indexes:**
- `text` (unique)
- `deleted_at`

**⚠️ Important:** This collection is GLOBAL. Changes affect all users.

---

### word_occurrences

Links words to their occurrences in sentences.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `word_id` | string | yes | - | FK to words.$id |
| `sentence_id` | string | yes | - | FK to sentences.$id |
| `start_index` | integer | no | - | Character position start |
| `end_index` | integer | no | - | Character position end |

**Notes:**
- Used for word frequency calculation
- Position indexes enable word highlighting in sentences
- CASCADE deleted when sentence is deleted

**Indexes:**
- `word_id`
- `sentence_id`

---

### user_word_statuses

User-specific learning progress for each word (FSRS state).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `user_id` | string | yes | - | FK to users.$id |
| `word_id` | string | yes | - | FK to words.$id |
| `status` | string | yes | "NEW" | Learning status |
| `fsrs_due` | datetime | no | null | Next review due date |
| `fsrs_stability` | float | no | null | FSRS stability |
| `fsrs_difficulty` | float | no | null | FSRS difficulty |
| `fsrs_elapsed_days` | integer | yes | 0 | Days since last review |
| `fsrs_scheduled_days` | integer | yes | 0 | Scheduled interval |
| `fsrs_reps` | integer | yes | 0 | Total reviews count |
| `fsrs_lapses` | integer | yes | 0 | Lapse (forgot) count |
| `fsrs_state` | integer | yes | 0 | FSRS state enum |
| `fsrs_last_review` | datetime | no | null | Last review timestamp |
| `error_count` | integer | yes | 0 | Total errors in dictation |
| `last_error_at` | datetime | no | null | Last error timestamp |
| `deleted_at` | datetime | no | null | Soft delete timestamp |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Status Values:**
- `NEW` - Never studied
- `LEARNING` - Currently learning
- `MASTERED` - Fully learned (high stability)

**FSRS State Values:**
- `0` - New
- `1` - Learning
- `2` - Review
- `3` - Relearning

**Indexes:**
- `user_id` + `word_id` (unique)
- `user_id` + `status`
- `user_id` + `fsrs_due`
- `user_id` + `deleted_at` (for trash queries)

---

### word_reviews

History of individual word review events.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `user_word_status_id` | string | yes | - | FK to user_word_statuses.$id |
| `rating` | integer | yes | - | FSRS rating (1-4) |
| `mode` | string | yes | - | Review mode |
| `response_time_ms` | integer | yes | - | Time to answer in ms |
| `was_correct` | boolean | yes | - | Correct answer flag |
| `error_count` | integer | yes | 0 | Errors in this review |
| `new_stability` | float | yes | - | Updated stability |
| `new_difficulty` | float | yes | - | Updated difficulty |
| `new_due` | datetime | yes | - | Updated due date |
| `$createdAt` | datetime | auto | - | Review timestamp |

**Rating Values (FSRS):**
- `1` - Again (forgot)
- `2` - Hard
- `3` - Good
- `4` - Easy

**Mode Values:**
- `typing` - Type the word
- `multiple_choice` - Select from options
- `context_listening` - Fill blank in sentence

**Indexes:**
- `user_word_status_id`

---

### word_relations

Relationships between words (synonyms, antonyms, etc.).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `word_id` | string | yes | - | FK to words.$id |
| `related_word_id` | string | no | - | FK to words.$id (if in database) |
| `custom_text` | string | no | - | Related word text (if not in DB) |
| `relation_type` | string | yes | - | Relationship type |
| `$createdAt` | datetime | auto | - | Creation timestamp |

**Relation Types:**
- `SYNONYM`
- `ANTONYM`
- `IDIOM`
- `DERIVATIVE`

**Indexes:**
- `word_id`

---

### practice_progress

User progress on sentence dictation practice.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `user_id` | string | yes | - | FK to users.$id |
| `sentence_id` | string | yes | - | FK to sentences.$id |
| `score` | integer | yes | - | Accuracy score (0-100) |
| `attempts` | integer | yes | 1 | Number of attempts |
| `duration` | integer | yes | 0 | Total practice time (seconds) |
| `recording_file_id` | string | no | null | Appwrite Storage file ID for user recording |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Indexes:**
- `user_id` + `sentence_id` (unique)

---

### daily_study_stats

Aggregated daily study statistics per user.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `user_id` | string | yes | - | FK to users.$id |
| `date` | datetime | yes | - | Date (normalized to midnight) |
| `study_duration` | integer | yes | 0 | Study time in seconds |
| `words_added` | integer | yes | 0 | New words added |
| `sentences_added` | integer | yes | 0 | New sentences added |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Indexes:**
- `user_id` + `date` (unique)

---

### dictionaries

User-created custom word lists.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `name` | string | yes | - | Dictionary name |
| `description` | string | no | - | Description |
| `user_id` | string | yes | - | FK to users.$id |
| `is_system` | boolean | yes | false | System dictionary flag |
| `filter` | string | no | - | JSON filter criteria |
| `deleted_at` | datetime | no | null | Soft delete timestamp |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Filter JSON Structure:**
```json
{
  "status": ["NEW", "LEARNING"],
  "collins": [4, 5],
  "oxford": true,
  "materialIds": ["abc123"]
}
```

**Indexes:**
- `user_id` + `deleted_at`

---

### dictionary_words

Junction table linking dictionaries to words.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `dictionary_id` | string | yes | - | FK to dictionaries.$id |
| `word_id` | string | yes | - | FK to words.$id |
| `added_at` | datetime | yes | - | When word was added |

**Notes:**
- Logical composite key: (dictionary_id, word_id)
- CASCADE deleted when dictionary is deleted

**Indexes:**
- `dictionary_id`
- `word_id`

---

### notifications

User notification messages.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `user_id` | string | yes | - | FK to users.$id |
| `type` | string | yes | - | Notification type |
| `title` | string | yes | - | Notification title |
| `message` | string | yes | - | Notification body |
| `is_read` | boolean | yes | false | Read status |
| `related_id` | string | no | null | Related entity ID |
| `related_type` | string | no | null | Related entity type |
| `$createdAt` | datetime | auto | - | Creation timestamp |

**Type Values:**
- `MATERIAL_UPLOADED`
- `MATERIAL_PROCESSED`
- `VOCAB_EXTRACTED`
- `PRACTICE_MILESTONE`
- `SYSTEM`

**Related Type Values:**
- `material`
- `word`
- `dictionary`

**Indexes:**
- `user_id` + `is_read`
- `user_id` + `$createdAt`

---

### export_jobs

Data export job queue.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `user_id` | string | yes | - | FK to users.$id |
| `options` | string | yes | - | JSON export options |
| `status` | string | yes | - | Job status |
| `file_path` | string | no | null | Appwrite Storage file ID |
| `error` | string | no | null | Error message |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Options JSON Structure:**
```json
{
  "include": {
    "learning": true,
    "vocab": true,
    "dict": true,
    "materials": true,
    "user": true
  }
}
```

**Status Values:**
- `queued`
- `processing`
- `finished`
- `failed`

**Indexes:**
- `user_id`

---

### import_jobs

Data import job queue.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `$id` | string | auto | cuid | Primary key |
| `user_id` | string | yes | - | FK to users.$id |
| `status` | string | yes | - | Job status |
| `file_path` | string | no | null | Uploaded ZIP file ID |
| `error` | string | no | null | Error message |
| `$createdAt` | datetime | auto | - | Creation timestamp |
| `$updatedAt` | datetime | auto | - | Last update timestamp |

**Status Values:**
- `queued`
- `processing`
- `finished`
- `failed`

**Indexes:**
- `user_id`

---

## Enums & Constants

### Word Status

```typescript
type WordStatus = 'NEW' | 'LEARNING' | 'MASTERED';
```

### FSRS State

```typescript
enum FSRSState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}
```

### FSRS Rating

```typescript
enum FSRSRating {
  Again = 1,  // Forgot
  Hard = 2,
  Good = 3,
  Easy = 4,
}
```

### User Role

```typescript
type UserRole = 'USER' | 'ADMIN';
```

### Notification Type

```typescript
type NotificationType = 
  | 'MATERIAL_UPLOADED'
  | 'MATERIAL_PROCESSED'
  | 'VOCAB_EXTRACTED'
  | 'PRACTICE_MILESTONE'
  | 'SYSTEM';
```

### Job Status

```typescript
type JobStatus = 'queued' | 'processing' | 'finished' | 'failed';
```

### Relation Type

```typescript
type RelationType = 'SYNONYM' | 'ANTONYM' | 'IDIOM' | 'DERIVATIVE';
```

### Review Mode

```typescript
type ReviewMode = 'typing' | 'multiple_choice' | 'context_listening';
```

---

## Indexes

### Recommended Indexes

| Collection | Fields | Type | Purpose |
|------------|--------|------|---------|
| users | email | unique | Login lookup |
| users | username | unique | Username lookup |
| words | text | unique | Word deduplication |
| materials | user_id, deleted_at | composite | User materials list |
| folders | user_id, parent_id, order | composite | Folder tree |
| sentences | material_id, deleted_at | composite | Material sentences |
| word_occurrences | sentence_id | single | Sentence vocabulary |
| word_occurrences | word_id | single | Word frequency |
| user_word_statuses | user_id, word_id | unique | User vocabulary |
| user_word_statuses | user_id, status | composite | Status filtering |
| user_word_statuses | user_id, fsrs_due | composite | Due words |
| daily_study_stats | user_id, date | unique | Daily stats |
| notifications | user_id, is_read | composite | Unread count |
| dictionaries | user_id, deleted_at | composite | User dictionaries |

---

## Storage Buckets

### materials

Stores uploaded audio/video files.

| Setting | Value |
|---------|-------|
| Bucket ID | `materials` |
| Max File Size | 524,288,000 bytes (500MB) |
| Allowed Extensions | audio/*, video/* |
| File Security | Per-file (user read permission) |

### exports

Stores generated export ZIP files.

| Setting | Value |
|---------|-------|
| Bucket ID | `exports` |
| Allowed Extensions | zip |
| File Security | Per-file (user read permission) |

### avatars

Stores user profile images.

| Setting | Value |
|---------|-------|
| Bucket ID | `avatars` |
| Allowed Extensions | png, jpg, jpeg, gif, webp |
| File Security | Public read |

### recordings

Stores user audio recordings for dictation practice.

| Setting | Value |
|---------|-------|
| Bucket ID | `recordings` |
| Max File Size | 52,428,800 bytes (50MB) |
| Allowed Extensions | webm, mp3, wav, ogg |
| File Security | Per-file (user read permission) |

---

## Collection IDs Reference

```typescript
// lib/db/collections.ts
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

export const BUCKETS = {
  MATERIALS: 'materials',
  EXPORTS: 'exports',
  AVATARS: 'avatars',
  RECORDINGS: 'recordings',
} as const;
```

---

## Notes & Caveats

### Global Words Table

The `words` collection does not have a `user_id` field. This means:
- Words are shared across all users
- Deleting a word affects ALL users' vocabulary
- Word metadata updates are global

This is intentional for dictionary efficiency but requires careful handling.

### Soft Delete Pattern

Collections using soft delete (`deleted_at` field):
- materials
- folders
- sentences
- words
- dictionaries
- user_word_statuses (for per-user trash functionality)

Collections with hard delete:
- word_occurrences (cascades with sentence)
- dictionary_words (cascades with dictionary)
- word_reviews
- practice_progress
- notifications

### Appwrite Limitations

1. **No Foreign Keys**: Referential integrity must be enforced in application code
2. **Limited Joins**: Related data requires multiple queries
3. **Query Limits**: Maximum 100 documents per query by default
4. **No Transactions**: Multi-document operations are not atomic

---

*This schema documentation should be updated whenever database changes are made.*
