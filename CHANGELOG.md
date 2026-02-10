# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-02-10
### Changed
- Migrated runtime backend paths from Supabase-style patterns to Appwrite for database and storage operations.
- Standardized server actions around Appwrite admin client usage for permission consistency.
- Consolidated auth flow around NextAuth + Appwrite user data.
- Updated baseline runtime/documentation alignment for Next.js 16, React 19, Tailwind CSS 4, and current route surface.

### Fixed
- Fixed word-learning sentence material typing to support `filePath`/`file_path` access without TypeScript errors.
- Fixed missing export history refresh handler in data settings.
- Fixed local LRU cache generic typing so cache entry retrieval types remain consistent.
- Fixed middleware auth wrapper invocation/signature compatibility for Next.js 16 type checks.

### Docs
- Refreshed `README.md` to match current framework versions, required environment variables, Appwrite collections/buckets, and feature set.

## [0.1.0] - 2025-12-08
### Added
- Deep listening workflow: upload audio/video (500MB limit), dedupe checks, nested folders, drag-and-drop, re-transcribe, and trash with 30-day retention.
- Transcription pipeline with Faster-Whisper (default) and OpenAI Whisper options, VAD-enabled silence removal, punctuation/length-based sentence segmentation, and stored timelines.
- Vocabulary extraction tied to source sentences, global de-duplicated word store, Oxford/Collins filters, custom dictionaries (from filters or manual add), and Anki CSV export.
- FSRS-powered learning modes: typing/dictation, multiple choice (including synonym direction), context listening, session recovery, keyboard shortcuts; sentence practice with diff scoring, A-B loop, and timing tweaks.
- Dashboard with heatmap, daily goals, vocab/sentence snapshots, hardest words, and notification center for background jobs.
- Data portability via export/import ZIP (settings, vocab + statuses, learning records, dictionaries, materials/transcripts) with merge/overwrite options; storage buckets for materials/avatars/exports.
- Auth and security: NextAuth v4 with email verification, reset, TOTP 2FA, role/quota handling; optional Redis caching.
- Dev/ops tooling: `echo.config.json` → `src/config/site.ts` sync, env-driven ports/URLs, Python transcription script (`scripts/transcribe.py`), Appwrite API setup, and SMTP email templates.

[Unreleased]: https://github.com/zerostwo/echo/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/zerostwo/echo/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/zerostwo/echo/releases/tag/v0.1.0
