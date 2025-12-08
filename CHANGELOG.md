# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-12-08
### Added
- Deep listening workflow: upload audio/video (500MB limit), dedupe checks, nested folders, drag-and-drop, re-transcribe, and trash with 30-day retention.
- Transcription pipeline with Faster-Whisper (default) and OpenAI Whisper options, VAD-enabled silence removal, punctuation/length-based sentence segmentation, and stored timelines.
- Vocabulary extraction tied to source sentences, global de-duplicated word store, Oxford/Collins filters, custom dictionaries (from filters or manual add), and Anki CSV export.
- FSRS-powered learning modes: typing/dictation, multiple choice (including synonym direction), context listening, session recovery, keyboard shortcuts; sentence practice with diff scoring, A-B loop, and timing tweaks.
- Dashboard with heatmap, daily goals, vocab/sentence snapshots, hardest words, and notification center for background jobs.
- Data portability via export/import ZIP (settings, vocab + statuses, learning records, dictionaries, materials/transcripts) with merge/overwrite options; Supabase storage buckets for materials/avatars/exports.
- Auth and security: NextAuth v5 with email verification, reset, TOTP 2FA, role/quota handling; optional Redis caching.
- Dev/ops tooling: `echo.config.json` → `src/config/site.ts` sync, env-driven ports/URLs, Python transcription script (`scripts/transcribe.py`), Supabase Service Role setup, and SMTP email templates.

[Unreleased]: https://github.com/zerostwo/echo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/zerostwo/echo/releases/tag/v0.1.0
