# Echo

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.0-black)
![React](https://img.shields.io/badge/React-19.0-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2d3748)

Echo is a deep-listening and precision-learning platform: upload audio/video, auto-transcribe into sentence-level practice, extract vocabulary with FSRS scheduling, and learn through focused word and sentence drills.

## Highlights

- 🎧 Transcription & segmentation: Faster-Whisper by default (switchable to OpenAI Whisper) with VAD silence removal, punctuation/length-based sentence splits, and stored timelines; one-click re-transcribe.
- 📂 Materials workspace: Nested folders with drag-drop upload/move (500MB limit), duplicate checks, rename, trash (30-day retention), detail view with audio/video streaming, WPM and vocab stats.
- 📚 Vocabulary & dictionaries: Global de-duplicated word store with source sentences; filters for Oxford/Collins levels and more; Anki CSV export; custom dictionaries (built from filters or manual add) that feed directly into learning.
- 🧠 Study modes: FSRS spaced repetition; words support typing/dictation, multiple choice (incl. synonym direction), and context listening; session recovery and shortcuts. Sentence practice includes dictation scoring with diffs, adjustable start/end, A-B loop, and per-word lookup.
- 📊 Progress feedback: Dashboard heatmap, daily goals, vocab/sentence snapshots, hardest words, and a notification center for background tasks.
- 🔄 Data portability: Export/import ZIP (settings, vocab + statuses, learning records, dictionaries, materials/transcripts) with merge or overwrite options, backed by Supabase storage.
- 🔒 Safety: NextAuth v5 with email verification, reset, TOTP 2FA, roles/quotas, optional Redis caching.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **UI**: Tailwind CSS v4, Radix UI, Lucide Icons
- **Backend**: Prisma + PostgreSQL (Supabase), Redis (optional)
- **AI / NLP**: Faster-Whisper, OpenAI Whisper, ts-fsrs, natural
- **Storage / Uploads**: Supabase Storage (materials/avatars/exports), Better Upload pipeline
- **Auth**: NextAuth v5 (Credentials), TOTP 2FA, SMTP mailers
- **Scripts**: Python 3 (`scripts/transcribe.py` and helpers)

## Quick Start

1) Clone & install
```bash
git clone https://github.com/zerostwo/echo.git
cd echo
npm install
pip install -r scripts/requirements.txt   # Whisper-related deps
```

2) Environment (example)
```env
AUTH_SECRET=your_nextauth_secret
DATABASE_URL=postgresql://user:pass@host:5432/db
DIRECT_URL=postgresql://user:pass@host:5432/db
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...             # for storage/export/import
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
SMTP_SENDER_NAME=Echo
SMTP_ADMIN_EMAIL=no-reply@example.com
REDIS_URL=redis://localhost:6379          # optional cache
PYTHON_CMD=python3                        # optional, pick your interpreter
NEXT_PUBLIC_UMAMI_WEBSITE_ID=...          # optional analytics
NEXT_PUBLIC_APP_URL=http://localhost:17891
```

3) Database & storage
```bash
npx prisma migrate deploy
```
Supabase buckets expected: `materials` (private), `avatars` (public avatars), `exports` (import/export). With a service role key, missing buckets are auto-created when needed.

4) Run
```bash
npm run dev   # reads port from echo.config.json (default 17891)
```
Use `npm run build` / `npm run start` for production. Startup scripts sync `echo.config.json` into `src/config/site.ts` (domain/ports/version).

## Common Flows

- Upload & transcribe: drag-drop/batch upload audio/video; dedupe checks; store to Supabase; Python transcription (choose model/device/VAD); auto vocab extraction; notifications emitted.
- Materials browsing: grid/list toggle, folder breadcrumbs, re-transcribe, rename, move to trash, timestamps shown in your timezone.
- Word learning: filter by material/dictionary/Oxford/Collins/difficulty; session recovery, keyboard shortcuts, synonym questions, context playback, mark mastered/unknown.
- Sentence practice: jump to last practiced or first sentence of latest material; dictation scoring diff with missing/extra highlights, A-B loop, fine-grained timing tweaks, shortcut navigation, word sheet.
- Export/Import: select scope in Settings, download when ready; import supports merge or overwrite and polls progress after ZIP upload.
- Trash: paginate/sort, bulk restore/empty; auto-purge after 30 days.

## Configuration Notes

- Whisper options: pass `TranscriptionOptions` (defaults to faster-whisper base + VAD); set `PYTHON_CMD` if multiple Python installs exist.
- Caching: set `REDIS_URL` to enable ioredis caching for lists/stats.
- Ports & URLs: `echo.config.json` controls dev/prod ports and domains; dev port defaults to 17891.
- Notifications: transcription/vocab jobs and export/import completion surface in the notification center and refresh dashboard stats.

## License

MIT License.
