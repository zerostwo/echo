# Echo

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.0-black)
![React](https://img.shields.io/badge/React-19.0-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2d3748)

**Echo** is a sophisticated language learning platform designed to help you master foreign languages through "Deep Listening". It combines state-of-the-art AI transcription with a powerful vocabulary management system and spaced repetition learning.

## 🚀 Features

### 🎧 Smart Media Processing
- **AI Transcription**: Leverages **Faster-Whisper** and **OpenAI Whisper** for high-accuracy audio/video transcription.
- **Intelligent Segmentation**: Automatically splits content into natural sentences using VAD (Voice Activity Detection) and punctuation logic.
- **Format Support**: Handles various audio and video formats with ease.

### 📚 Advanced Words System
- **Contextual Learning**: Words are extracted directly from your media, preserving the context in which they were used.
- **Global Dictionary**: Efficiently manages words across all users and materials to minimize redundancy.
- **Smart Extraction**: Automatically identifies and looks up new words from transcribed content.

### 🧠 Spaced Repetition System (SRS)
- **FSRS Algorithm**: Implements the Free Spaced Repetition Scheduler (`ts-fsrs`) for optimal review scheduling.
- **Review Modes**: Multiple ways to practice, including typing and multiple-choice.
- **Progress Tracking**: Detailed statistics on your learning stability, difficulty, and retention.

### 📂 Organization & Management
- **Folder System**: Organize your learning materials with a nested folder structure.
- **Drag & Drop**: Intuitive UI for managing files and folders.
- **Dashboard**: Comprehensive overview of your daily progress, streaks, and recent activities.

### 🔒 Security & Platform
- **Authentication**: Secure login via NextAuth v5 with 2FA support.
- **Performance**: Redis caching for lightning-fast data retrieval.
- **Modern UI**: Built with Radix UI and Tailwind CSS v4 for a polished, accessible experience.

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Language**: TypeScript, Python (for AI processing)
- **Database**: PostgreSQL (via Supabase), Prisma ORM
- **Styling**: Tailwind CSS v4, Radix UI, Lucide Icons
- **AI/ML**: Faster-Whisper, OpenAI Whisper, Natural (NLP)
- **Auth**: NextAuth.js v5
- **State/Cache**: Redis, TanStack Query (implied), Zustand (implied)

## 🏁 Getting Started

### Prerequisites

- **Node.js**: v18.17 or higher (v20+ recommended)
- **Python**: v3.8+ (for transcription scripts)
- **PostgreSQL**: Local instance or cloud provider (e.g., Supabase)
- **Redis**: (Optional) For caching performance

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/zerostwo/echo.git
    cd echo
    ```

2.  **Install Node.js dependencies**
    ```bash
    npm install
    ```

3.  **Install Python dependencies**
    ```bash
    pip install -r scripts/requirements.txt
    ```

4.  **Environment Setup**
    Create a `.env` file in the root directory based on `.env.example`:
    ```env
    DATABASE_URL="postgresql://..."
    DIRECT_URL="postgresql://..."
    NEXTAUTH_SECRET="your-secret"
    # ... other vars
    ```

5.  **Database Setup**
    ```bash
    npx prisma migrate deploy
    ```

6.  **Run Development Server**
    ```bash
    npm run dev
    ```

    Visit [http://localhost:3000](http://localhost:3000) to see the app.

## 🧩 Project Structure

```
Echo/
├── prisma/                 # Database schema and migrations
├── public/                 # Static assets
├── scripts/                # Python AI & Utility scripts
│   ├── transcribe.py       # Whisper transcription logic
│   ├── query_dict.py       # Dictionary lookup service
│   └── ...
├── src/
│   ├── actions/            # Server Actions (Next.js)
│   ├── app/                # App Router pages & layouts
│   │   ├── (auth)/         # Authentication routes
│   │   ├── admin/          # Admin dashboard
│   │   ├── dashboard/      # User dashboard
│   │   ├── study/          # Study & Review interface
│   │   │   ├── words/      # Word learning
│   │   │   └── sentences/  # Sentence practice
│   │   ├── words/          # Word management
│   │   └── ...
│   ├── components/         # React UI components
│   ├── lib/                # Core utilities (DB, Auth, etc.)
│   └── services/           # Business logic services
└── ...
```

## ⚙️ Configuration

### Transcription Settings
Configure your preferred transcription engine in the app settings:
- **Engine**: Faster-Whisper (Recommended for speed) or OpenAI Whisper.
- **Model Size**: Tiny to Large-v3 (Trade-off between speed and accuracy).
- **Compute**: GPU (CUDA) or CPU.

### Caching
To enable Redis caching for improved performance, set the `REDIS_URL` environment variable.

## 📄 License

This project is licensed under the MIT License.
