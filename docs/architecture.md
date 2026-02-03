# Echo Codebase Architecture Audit

> **Generated**: February 2026  
> **Status**: READ-ONLY Analysis  
> **Purpose**: Comprehensive architectural understanding before refactoring

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Folder/Module Structure](#2-foldermodule-structure)
3. [Database Schema Summary](#3-database-schema-summary)
4. [Feature Map](#4-feature-map)
5. [Problems Detected](#5-problems-detected)
6. [Database Issues](#6-database-issues)
7. [Technical Debt List](#7-technical-debt-list)
8. [Refactor Plan](#8-refactor-plan)
9. [Suggested Target Architecture](#9-suggested-target-architecture)

---

## 1. Project Overview

**Echo** is a language learning platform focused on "deep listening and precision learning."

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Database | Appwrite (BaaS) |
| UI | shadcn/ui + Tailwind CSS + Radix primitives |
| Auth | NextAuth.js v4 with Credentials provider |
| Learning Algorithm | FSRS (ts-fsrs) for spaced repetition |
| External Tools | Python scripts (Whisper transcription, dictionary lookup) |

### Core Value Proposition

```
Upload audio/video → Transcribe with Whisper → Extract vocabulary 
→ Learn words with spaced repetition → Practice with dictation
```

### Key Dependencies

```json
{
  "next": "^16.0.7",
  "next-auth": "^4.24.13",
  "appwrite": "^21.5.0",
  "node-appwrite": "^21.0.0",
  "ts-fsrs": "^5.2.3",
  "@prisma/client": "^5.22.0"  // ⚠️ NOT ACTIVELY USED
}
```

---

## 2. Folder/Module Structure

```
src/
├── actions/           # 16 Server Actions (business logic layer)
│   ├── admin-actions.ts
│   ├── auth-actions.ts
│   ├── dictionary-actions.ts    (857 lines)
│   ├── folder-actions.ts        (405 lines)
│   ├── learning-actions.ts      (1374 lines) ⚠️ LARGE
│   ├── listening-actions.ts     (442 lines)
│   ├── material-actions.ts      (1030 lines) ⚠️ LARGE
│   ├── move-actions.ts
│   ├── notification-actions.ts  (274 lines)
│   ├── security-actions.ts
│   ├── sentence-actions.ts      (924 lines)
│   ├── trash-actions.ts         (288 lines)
│   ├── user-actions.ts
│   ├── verify-email-action.ts
│   ├── vocab-actions.ts         (987 lines)
│   └── word-actions.ts          (989 lines)
│
├── app/               # Next.js App Router pages
│   ├── (auth)/        # Auth routes (login, register, forgot-password, etc.)
│   ├── admin/         # Admin panel (dashboard, settings, users)
│   ├── api/           # API routes (15 files)
│   │   ├── auth/[...nextauth]/
│   │   ├── dashboard/stats/
│   │   ├── export/
│   │   ├── import/
│   │   ├── materials/[id]/stream/
│   │   ├── upload/
│   │   └── vocab/bulk-extract/
│   ├── dashboard/     # User dashboard
│   ├── dictionaries/  # Custom dictionaries
│   ├── materials/     # Material management
│   ├── study/         # Learning interfaces (words, sentences)
│   ├── trash/         # Trash management
│   └── words/         # Vocabulary management
│
├── components/        # 67 React components
│   ├── dashboard/     # Dashboard widgets (9 files)
│   ├── dictionaries/  # Dictionary components (9 files)
│   ├── materials/     # Material components (7 files)
│   ├── settings/      # Settings dialogs (4 files)
│   ├── sidebar/       # Navigation (4 files)
│   ├── trash/         # Trash components (5 files)
│   └── ui/            # shadcn/ui primitives (28 files)
│
├── config/            # Site configuration
│   └── site.ts
│
├── context/           # React contexts
│   └── breadcrumb-context.tsx
│
├── hooks/             # Custom hooks
│   ├── use-debounce.ts
│   └── use-mobile.ts
│
├── lib/               # Utilities and clients
│   ├── appwrite.ts        # Appwrite server client
│   ├── appwrite_client.ts # Collection IDs
│   ├── email.ts           # Email service (nodemailer/resend)
│   ├── folder-utils.ts    # Folder tree utilities
│   ├── prisma.ts          # ⚠️ UNUSED - Prisma client
│   ├── redis.ts           # ⚠️ DISABLED - Redis caching
│   ├── time.ts            # Time formatting
│   ├── utils.ts           # General utilities (cn, etc.)
│   └── vocab-utils.ts     # Vocabulary helpers
│
├── services/          # External services
│   ├── export-service.ts
│   ├── import-service.ts
│   └── transcription.ts
│
├── auth.ts            # NextAuth configuration
└── middleware.ts      # Route protection
```

### File Count by Type

| Type | Count |
|------|-------|
| TypeScript (.ts) | 12 |
| TypeScript React (.tsx) | 14 |
| Total in src/ | ~165 files |

---

## 3. Database Schema Summary

### Critical Finding

> ⚠️ **The Prisma schema (`prisma/schema.prisma`) defines PostgreSQL tables, but ALL actual database operations use Appwrite's Document Database.**

The Prisma schema appears to be legacy or intended for future migration. This creates significant confusion.

### Actual Appwrite Collections

#### Core Entities

| Collection | Key Fields | Purpose |
|------------|------------|---------|
| `users` | username, email, password, role, quota, used_space, settings (JSON), 2FA fields | User accounts |
| `materials` | title, filename, file_path, user_id, folder_id, is_processed, transcription_* | Audio/video uploads |
| `folders` | name, user_id, parent_id, order | Hierarchical organization |
| `sentences` | material_id, content, edited_content, start_time, end_time, order | Transcription segments |

#### Vocabulary System

| Collection | Key Fields | Purpose |
|------------|------------|---------|
| `words` | text, phonetic, translation, definition, pos, collins, oxford, bnc, frq | Dictionary entries (GLOBAL) |
| `word_occurrences` | word_id, sentence_id, start_index, end_index | Word-sentence links |
| `user_word_statuses` | user_id, word_id, status, fsrs_* (8 fields), error_count | User learning progress |
| `word_reviews` | user_word_status_id, rating, mode, response_time_ms, was_correct | Review history |
| `word_relations` | word_id, related_word_id, relation_type | Synonyms/antonyms |

#### Learning & Progress

| Collection | Key Fields | Purpose |
|------------|------------|---------|
| `practice_progress` | user_id, sentence_id, score, attempts, duration | Dictation progress |
| `daily_study_stats` | user_id, date, study_duration, words_added, sentences_added | Activity tracking |
| `dictionaries` | name, user_id, is_system, filter (JSON) | Custom word lists |
| `dictionary_words` | dictionary_id, word_id | Dictionary membership |

#### System

| Collection | Key Fields | Purpose |
|------------|------------|---------|
| `notifications` | user_id, type, title, message, is_read | User notifications |
| `export_jobs` | user_id, options (JSON), status, file_path | Data export queue |
| `import_jobs` | user_id, status, file_path | Data import queue |

### Entity Relationships

```
users
 ├── materials (1:N)
 │    └── sentences (1:N)
 │         └── word_occurrences (1:N) ──► words (N:1)
 ├── folders (1:N, self-referential)
 ├── user_word_statuses (1:N) ──► words (N:1)
 │    └── word_reviews (1:N)
 ├── practice_progress (1:N) ──► sentences (N:1)
 ├── daily_study_stats (1:N)
 ├── notifications (1:N)
 ├── dictionaries (1:N)
 │    └── dictionary_words (1:N) ──► words (N:1)
 ├── export_jobs (1:N)
 └── import_jobs (1:N)

words (GLOBAL - no user_id)
 ├── word_occurrences (1:N)
 ├── user_word_statuses (1:N)
 ├── dictionary_words (1:N)
 └── word_relations (1:N, self-referential)
```

---

## 4. Feature Map

### Feature 1: Material Upload & Transcription

| Aspect | Details |
|--------|---------|
| **Entry Points** | `/materials`, `upload-dialog.tsx`, `/api/upload` |
| **Key Files** | `material-actions.ts`, `transcription.ts`, `scripts/transcribe.py` |
| **Data Flow** | File upload → Appwrite Storage → Register material → Queue transcription → Whisper → Save sentences → Extract vocabulary |
| **Collections** | materials, sentences, word_occurrences, words |

### Feature 2: Vocabulary Management

| Aspect | Details |
|--------|---------|
| **Entry Points** | `/words` |
| **Key Files** | `vocab-actions.ts`, `word-actions.ts`, `vocab-client.tsx` |
| **Data Flow** | Query user_word_statuses → Join words → Filter/sort → Paginate |
| **Collections** | words, user_word_statuses, word_occurrences |

### Feature 3: Spaced Repetition Learning (FSRS)

| Aspect | Details |
|--------|---------|
| **Entry Points** | `/study/words` |
| **Key Files** | `learning-actions.ts`, `learn-client.tsx` |
| **Data Flow** | Get due words → Present flashcard → Record review → Update FSRS state |
| **Collections** | user_word_statuses, word_reviews, daily_study_stats |

### Feature 4: Dictation Practice

| Aspect | Details |
|--------|---------|
| **Entry Points** | `/study/sentences/[id]` |
| **Key Files** | `listening-actions.ts`, `practice-interface.tsx` |
| **Data Flow** | Load sentence → Play audio → User types → Diff comparison → Update progress |
| **Collections** | sentences, practice_progress, user_word_statuses |

### Feature 5: Custom Dictionaries

| Aspect | Details |
|--------|---------|
| **Entry Points** | `/dictionaries` |
| **Key Files** | `dictionary-actions.ts`, `dictionaries-client.tsx` |
| **Data Flow** | Create dictionary → Add words → Filter during study |
| **Collections** | dictionaries, dictionary_words |

### Feature 6: Folder Organization

| Aspect | Details |
|--------|---------|
| **Entry Points** | `/materials` sidebar |
| **Key Files** | `folder-actions.ts`, `sidebar-folder-tree.tsx` |
| **Data Flow** | Hierarchical tree → Drag-drop materials |
| **Collections** | folders, materials |

### Feature 7: Data Export/Import

| Aspect | Details |
|--------|---------|
| **Entry Points** | Settings dialog |
| **Key Files** | `export-service.ts`, `import-service.ts`, API routes |
| **Data Flow** | Create job → Process async → ZIP → Appwrite Storage → Download |
| **Collections** | export_jobs, import_jobs |

### Feature 8: Authentication & 2FA

| Aspect | Details |
|--------|---------|
| **Entry Points** | `/login`, `/register` |
| **Key Files** | `auth.ts`, `auth-actions.ts`, `security-actions.ts` |
| **Data Flow** | Credentials → bcrypt verify → Check 2FA (otplib) → JWT |
| **Collections** | users |

---

## 5. Problems Detected

### 5.1 Architecture Issues

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| **Dual Database Systems** | 🔴 HIGH | `prisma/schema.prisma`, `lib/appwrite.ts` | Prisma schema exists but code uses Appwrite. Creates confusion. |
| **No Service Layer** | 🔴 HIGH | `actions/*.ts` | Business logic directly in server actions. Actions are 500-1400 lines. |
| **Missing Data Access Layer** | 🔴 HIGH | All actions | Raw Appwrite SDK calls everywhere. No abstraction. |
| **Disabled Redis Layer** | 🟡 MEDIUM | `lib/redis.ts` | Redis code exists but returns `null`. Dead code. |
| **Inconsistent ID Exports** | 🟡 MEDIUM | `lib/appwrite*.ts` | Collection IDs in two files with different patterns. |

### 5.2 Code Quality Issues

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| **Giant Action Files** | 🔴 HIGH | `learning-actions.ts`, `material-actions.ts` | 1000+ lines with multiple unrelated functions. |
| **Duplicate Helpers** | 🟡 MEDIUM | Multiple actions | `safeRevalidate()`, `revalidateInBackground()` defined 3+ times. |
| **Inconsistent Naming** | 🟡 MEDIUM | Throughout | Mix of `snake_case` and `camelCase` mapped inconsistently. |
| **No Type Safety** | 🟡 MEDIUM | All actions | Using `any` types for Appwrite documents. |
| **Hardcoded Strings** | 🟢 LOW | Many actions | Collection names as strings vs constants. |

### 5.3 Redundant/Dead Code

| Location | Issue |
|----------|-------|
| `lib/prisma.ts` | Prisma client created but never imported |
| `lib/redis.ts` | Redis disabled, all functions return null |
| `prisma/schema.prisma` | 362-line schema not matching Appwrite |
| Cache key generation | Functions exist but caching disabled |

### 5.4 Coupling Issues

```
material-actions.ts ──calls──► vocab-actions.ts (extractVocabulary)
vocab-actions.ts ──calls──► notification-actions.ts (createNotification)
learning-actions.ts ──duplicates──► listening-actions.ts (FSRS logic)
```

Actions make cross-module calls instead of using events/queues.

---

## 6. Database Issues

### 6.1 Schema Mismatches

| Issue | Description |
|-------|-------------|
| **Prisma vs Appwrite** | Prisma defines `WordReview`, Appwrite uses `word_reviews` without validation |
| **No Generated Types** | All Appwrite document access uses `any` type |

### 6.2 Data Model Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| **Words are Global** | 🔴 HIGH | `words` table has no `user_id`. Deleting a word affects ALL users. |
| **Settings as JSON String** | 🟡 MEDIUM | User settings stored as unparsed JSON string |
| **Soft Delete Inconsistency** | 🟡 MEDIUM | Some entities soft delete, others hard delete |
| **Composite Key Missing** | 🟢 LOW | `user_word_statuses` uses surrogate ID, should be (user_id, word_id) |

### 6.3 Performance Concerns

| Issue | Location | Description |
|-------|----------|-------------|
| **N+1 Queries** | `getDictionaries()` | Loops through dictionaries to fetch stats |
| **Memory Pagination** | `getVocabPaginated()` | Fetches all words, paginates in JS |
| **No Indexes** | Appwrite | Limited indexing on user_id lookups |

---

## 7. Technical Debt List

### 🔴 Priority: HIGH

| # | Issue | Impact |
|---|-------|--------|
| 1 | **Unify Database Strategy** | Confusion, dual maintenance |
| 2 | **Extract Service Layer** | Untestable, unmaintainable code |
| 3 | **Create Data Access Layer** | No abstraction, coupled to Appwrite |
| 4 | **Remove Dead Redis Code** | Confusion, false complexity |
| 5 | **Split Giant Actions** | 1000+ line files impossible to maintain |
| 6 | **Fix Global Words Issue** | Data integrity risk |

### 🟡 Priority: MEDIUM

| # | Issue | Impact |
|---|-------|--------|
| 7 | **Generate Appwrite Types** | Runtime errors from `any` types |
| 8 | **Consolidate Collection IDs** | Inconsistent references |
| 9 | **Remove Duplicate Helpers** | DRY violation |
| 10 | **Add Error Handling** | Inconsistent error responses |
| 11 | **Implement Proper Queues** | In-memory queue loses jobs on restart |

### 🟢 Priority: LOW

| # | Issue | Impact |
|---|-------|--------|
| 12 | **Standardize Naming** | Code readability |
| 13 | **Add Input Validation** | Security, data integrity |
| 14 | **Structured Logging** | Debugging difficulty |
| 15 | **Add Unit Tests** | Zero test coverage |

---

## 8. Refactor Plan

### Phase 1: Foundation Cleanup (1-2 days)

#### 1.1 Delete Unused Code

```bash
# Remove Prisma
rm lib/prisma.ts
rm -rf prisma/  # Or keep schema.prisma as documentation

# Update package.json - remove @prisma/client, prisma
```

#### 1.2 Consolidate Configuration

Create unified database configuration:

```
lib/
├── db/
│   ├── client.ts       # Single Appwrite client export
│   ├── collections.ts  # All collection IDs
│   └── types.ts        # TypeScript interfaces
```

#### 1.3 Extract Shared Utilities

```
lib/
├── utils/
│   ├── revalidate.ts   # Single revalidation helper
│   ├── pagination.ts   # Shared pagination
│   └── errors.ts       # Error utilities
```

### Phase 2: Service Layer (1-2 weeks)

Create proper service abstraction:

```
services/
├── material/
│   ├── material.service.ts
│   ├── material.repository.ts
│   └── types.ts
├── vocabulary/
│   ├── vocabulary.service.ts
│   ├── vocabulary.repository.ts
│   └── types.ts
├── learning/
│   ├── learning.service.ts
│   ├── fsrs.service.ts
│   └── types.ts
└── ...
```

### Phase 3: Slim Down Actions

Transform actions from 1000+ lines to ~50 lines:

```typescript
// BEFORE: material-actions.ts (1030 lines)
export async function uploadMaterial(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };
  // ... 200+ lines of business logic
}

// AFTER: material-actions.ts (~50 lines)
export async function uploadMaterial(formData: FormData) {
  const session = await requireAuth();
  const data = await MaterialSchema.parseAsync(formData);
  return materialService.upload(session.user.id, data);
}
```

### Phase 4: Database Decision

#### Option A: Stay with Appwrite
- Generate TypeScript types
- Add indexes via console
- Document schema separately
- Remove Prisma entirely

#### Option B: Migrate to PostgreSQL
- Significant effort
- Run both during migration
- Better tooling long-term

---

## 9. Suggested Target Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────┐
│                   UI Layer                       │
│  (React Components, Pages, Client State)         │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              Server Actions Layer                │
│  (Thin wrappers: auth → validate → delegate)     │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│               Service Layer                      │
│  (Business logic, FSRS, workflows)               │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│             Repository Layer                     │
│  (Appwrite SDK abstraction, type-safe queries)   │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│           Appwrite Database / Storage            │
└─────────────────────────────────────────────────┘
```

### Target Folder Structure

```
src/
├── app/                    # Next.js pages (unchanged)
├── components/             # UI components (unchanged)
│
├── config/
│   ├── site.ts
│   └── appwrite.ts
│
├── lib/
│   ├── db/
│   │   ├── client.ts      # Appwrite client
│   │   ├── collections.ts # Collection constants
│   │   └── types.ts       # Generated/manual types
│   ├── utils/
│   │   ├── auth.ts
│   │   ├── errors.ts
│   │   └── validation.ts
│   └── external/
│       ├── whisper.ts
│       └── dictionary.ts
│
├── repositories/          # Data access layer
│   ├── base.repository.ts
│   ├── material.repository.ts
│   ├── vocabulary.repository.ts
│   ├── user.repository.ts
│   └── index.ts
│
├── services/              # Business logic layer
│   ├── material.service.ts
│   ├── vocabulary.service.ts
│   ├── learning.service.ts
│   ├── notification.service.ts
│   └── index.ts
│
├── actions/               # Thin server actions
│   ├── material-actions.ts    (~100 lines)
│   ├── vocab-actions.ts       (~100 lines)
│   └── ...
│
├── types/                 # Shared TypeScript types
│   ├── material.ts
│   ├── vocabulary.ts
│   └── index.ts
│
├── auth.ts
└── middleware.ts
```

### Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| TypeScript variables | camelCase | `userId`, `materialId` |
| TypeScript types/interfaces | PascalCase | `Material`, `UserWordStatus` |
| Appwrite document fields | snake_case | `user_id`, `deleted_at` |
| Collection names | snake_case | `user_word_statuses` |
| File names | kebab-case | `material-actions.ts` |
| React components | PascalCase | `VocabClient.tsx` |

### Permission Strategy

1. **Document-level**: All entities have `user_id` field
2. **Service-level**: Validate ownership before operations
3. **Admin bypass**: Use admin client for all DB operations
4. **API-level**: Check `auth()` in every action

---

## Appendix: Quick Reference

### Collection IDs

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
  NOTIFICATIONS: 'notifications',
  DICTIONARIES: 'dictionaries',
  DICTIONARY_WORDS: 'dictionary_words',
  EXPORT_JOBS: 'export_jobs',
  IMPORT_JOBS: 'import_jobs',
} as const;
```

### FSRS States

```typescript
// From ts-fsrs
enum State {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

// User word statuses
type WordStatus = 'NEW' | 'LEARNING' | 'MASTERED';
```

### Key Environment Variables

```bash
# Appwrite
NEXT_PUBLIC_APPWRITE_ENDPOINT=
NEXT_PUBLIC_APPWRITE_PROJECT_ID=
NEXT_PUBLIC_APPWRITE_DATABASE_ID=
APPWRITE_API_KEY=

# Auth
AUTH_SECRET=

# Python (for transcription)
PYTHON_CMD=python3
```

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2026-02 | AI Audit | Initial architecture audit |

---

*This document is auto-generated and should be updated as the codebase evolves.*
