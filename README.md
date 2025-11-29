# Echo - Language Learning Platform

A Next.js-based language learning platform with audio/video transcription, vocabulary extraction, and practice features.

## Features

- **Audio/Video Material Upload**: Upload audio or video files for transcription
- **Whisper Transcription**: Supports both Faster-Whisper and OpenAI Whisper engines
  - VAD (Voice Activity Detection) filter to remove silence
  - Automatic sentence segmentation with punctuation-based splitting
  - Short sentence merging to avoid fragments
- **Vocabulary Extraction**: Automatically extract and look up vocabulary from transcribed content
- **Vocabulary Management**: Track learning progress, mark words as mastered
- **Listening Practice**: Practice listening comprehension with sentences from your materials

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.8+
- PostgreSQL (or Supabase)
- Optional: NVIDIA GPU with CUDA for faster transcription

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Echo
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Install Python dependencies:
```bash
pip install -r scripts/requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Set up the database:
```bash
npx prisma migrate deploy
```

6. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Transcription Settings

### Whisper Engine Selection

The application supports two Whisper implementations:

- **Faster-Whisper** (Recommended): Faster inference with CTranslate2 optimization and VAD filter support
- **OpenAI Whisper**: Original OpenAI implementation

### Available Models

| Model | VRAM | Speed | Accuracy |
|-------|------|-------|----------|
| tiny | ~1GB | Fastest | Low |
| base | ~1GB | Fast | Balanced |
| small | ~2GB | Medium | Good |
| medium | ~5GB | Slow | Better |
| large-v2 | ~10GB | Slowest | Best |
| large-v3 | ~10GB | Slowest | Best |

### Configuration

Settings can be configured in the Settings dialog under "General":

- **Transcription Engine**: Choose between Faster-Whisper or OpenAI Whisper
- **Whisper Model**: Select model size based on your hardware and accuracy needs
- **Language**: Auto-detect or specify the audio language
- **VAD Filter** (Faster-Whisper only): Filter out silent segments
- **Compute Type**: float16 (GPU), int8 (CPU), or auto
- **Device**: CUDA GPU, CPU, or auto-detect

### Environment Variables

```bash
# Python command for running transcription scripts
PYTHON_CMD=python3

# Custom directory for Whisper model downloads
WHISPER_MODEL_DIR=/path/to/your/whisper/models

# Redis (Optional - for caching to improve performance)
# If not set, the app works without caching
REDIS_URL=redis://localhost:6379
```

## Performance Optimization

### Redis Caching (Optional)

The app includes an optional Redis caching layer to significantly improve page load times:

- **Vocabulary Page**: Cached for 2 minutes
- **Materials Page**: Cached for 2 minutes
- Cache is automatically invalidated when data changes

To enable caching:

1. Install Redis locally or use a cloud service (e.g., Upstash, Redis Cloud)
2. Set the `REDIS_URL` environment variable

Without Redis, the app still works but may be slower for large datasets.

## Vocabulary System

### Word Reuse Optimization

The vocabulary system is optimized to reuse existing words across materials:

- Words are stored globally and shared across all users
- When a new material is transcribed, the system:
  1. Checks if words already exist in the database
  2. Only queries the dictionary for new words
  3. Links words to sentences via occurrences
- When a material is deleted:
  - Word occurrences are removed
  - Words themselves remain in the database for reuse
  - User's word status remains intact

### Sentence Segmentation

Transcribed text is automatically segmented into sentences:

- Split on strong punctuation: `.` `?` `!` (English) / `。` `！` `？` (Chinese)
- Handle combination punctuation like `?!` and `!?`
- Merge short sentences (< 3 words) with adjacent ones if gap is small
- Preserve accurate word-level timestamps

## Project Structure

```
Echo/
├── prisma/           # Database schema and migrations
├── scripts/          # Python scripts for transcription and dictionary
│   ├── transcribe.py # Whisper transcription with sentence splitting
│   ├── query_dict.py # Dictionary lookup for vocabulary
│   └── stardict.py   # StarDict database interface
├── src/
│   ├── actions/      # Server actions
│   ├── app/          # Next.js app router pages
│   ├── components/   # React components
│   ├── lib/          # Utility libraries
│   └── services/     # Service layer
└── data/             # Dictionary databases
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper)
- [OpenAI Whisper](https://github.com/openai/whisper)

## License

MIT
