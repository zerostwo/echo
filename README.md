# Echo

![Version](https://img.shields.io/badge/version-0.1.1-22c55e)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-149eca)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8)
![Appwrite](https://img.shields.io/badge/Appwrite-Cloud-f02e65)
![NextAuth](https://img.shields.io/badge/NextAuth-4.x-0ea5e9)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

Echo is a deep-listening and precision-learning platform: upload audio/video, transcribe to sentence-level practice, extract vocabulary with FSRS scheduling, and study through focused word and sentence drills.

Current release: `0.1.1` (`2026-02-10`).

## Highlights

- Materials workspace: nested folders, drag-and-drop upload, duplicate checks, rename, move to trash, restore, and timed auto-clean.
- Transcription pipeline: Faster-Whisper (default) or OpenAI Whisper, VAD support, sentence segmentation, and one-click re-transcribe.
- Vocabulary system: global de-duplicated word store, Oxford/Collins filtering, source sentence tracing, and Anki CSV export.
- Dictionaries: create from filters or manually add words, then use dictionaries directly in learning filters.
- Learning modes:
  - Word study: typing/dictation, multiple choice, synonym mode, context listening, keyboard shortcuts, session recovery.
  - Sentence study: dictation scoring with diff highlights, A-B loop playback, timing adjustments, inline word lookup.
- Progress and operations: dashboard snapshots, hardest words, notifications for background tasks, data export/import (ZIP, merge/overwrite).
- Security and administration: NextAuth credentials login with email verification, password reset, TOTP 2FA, role/quota controls, admin pages.

## Tech Stack

- Framework: Next.js 16 (App Router, Turbopack), React 19, TypeScript 5
- UI: Tailwind CSS v4, Radix UI, Lucide
- Data and storage: Appwrite (Database + Storage)
- Auth: NextAuth v4 (Credentials + JWT sessions)
- Caching: Redis via `ioredis` (optional)
- Data fetching: TanStack Query v5
- Learning and NLP: `ts-fsrs`, `natural`, Faster-Whisper / OpenAI Whisper
- Transcription runtime: Python scripts in `scripts/`

## Project Docs

- Architecture: `docs/architecture.md`
- Database and buckets: `docs/schema.md`
- Release notes: `CHANGELOG.md`

## Quick Start

### 1) Prerequisites

- Node.js 20+
- npm 10+
- Python 3.10+
- `ffmpeg` available in `PATH` (recommended for transcription workflows)

### 2) Install

```bash
git clone https://github.com/zerostwo/echo.git
cd echo
npm install
pip install -r scripts/requirements.txt
```

### 3) Configure environment

Create `.env` and set at least:

```env
AUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:17891
NEXT_PUBLIC_APP_URL=http://localhost:17891

NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your_project_id
NEXT_PUBLIC_APPWRITE_DATABASE_ID=echo_db
APPWRITE_API_KEY=your_api_key

SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=your_user
SMTP_PASS=your_password

# optional
REDIS_URL=redis://localhost:6379
PYTHON_CMD=python3
NEXT_PUBLIC_UMAMI_WEBSITE_ID=...
NEXT_PUBLIC_UMAMI_SCRIPT_URL=...
INTERNAL_REVALIDATE_TOKEN=...
```

### 4) Prepare Appwrite

Collections expected:

- `users`, `materials`, `sentences`, `words`, `word_occurrences`
- `user_word_statuses`, `practice_progress`, `daily_study_stats`
- `dictionaries`, `dictionary_words`, `folders`, `notifications`
- `export_jobs`, `import_jobs`

Buckets expected:

- `materials` (private)
- `avatars` (public)
- `exports` (private)

### 5) Run

```bash
npm run dev
```

The runner reads port/domain settings from `echo.config.json` and syncs them to `src/config/site.ts` before `dev/build/start`.

Production:

```bash
npm run build
npm run start
```

## Available Scripts

- `npm run dev`: start local development server
- `npm run build`: production build (with config sync)
- `npm run start`: start production server
- `npm run lint`: run ESLint

## Notes

- Next.js currently logs a deprecation warning for `middleware` naming (`proxy` migration is pending).
- `prisma/` and `src/lib/prisma.ts` are legacy artifacts; runtime data operations are Appwrite-based.

## License

MIT License.
