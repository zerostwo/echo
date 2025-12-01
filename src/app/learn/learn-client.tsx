'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LearningWord, recordReview, getRandomWords } from '@/actions/learning-actions';
import { getWordContext } from '@/actions/word-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeaderPortal } from '@/components/header-portal';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Keyboard, 
  ListChecks, 
  Volume2, 
  Check, 
  X, 
  SkipForward,
  Trophy,
  BookOpen,
  Sparkles,
  Clock,
  Target,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Eye,
  HelpCircle,
  Play,
  Pause,
  Headphones,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUserSettings } from '@/components/user-settings-provider';
import { ScrollArea } from '@/components/ui/scroll-area';

type LearningMode = 'typing' | 'multiple_choice' | 'context_listening';

interface LearnClientProps {
  initialWords: LearningWord[];
  stats: {
    totalNew: number;
    totalLearning: number;
    totalMastered: number;
    dueToday: number;
  };
}

interface SessionStats {
  correct: number;
  incorrect: number;
  totalTime: number;
  wordsReviewed: number;
  wpm: number;
}

interface SessionState {
  currentIndex: number;
  mode: LearningMode;
  sessionStats: SessionStats;
  wordIds: string[];
  timestamp: number;
}

interface WordOccurrence {
  id: string;
  start_index?: number;
  end_index?: number;
  sentence: {
    id: string;
    content: string;
    start_time?: number;
    end_time?: number;
    material_id?: string;
    material: {
      id: string;
      title: string;
    };
  };
}

const SESSION_STORAGE_KEY = 'echo_learning_session';

// Keyboard shortcuts help text
const SHORTCUTS = [
  { key: 'Shift + ←/→', description: 'Previous/Next word' },
  { key: 'Enter', description: 'Submit answer / Next word' },
  { key: 'Tab', description: 'Play pronunciation / Replay sentence' },
  { key: 'Ctrl + S', description: "Mark as 'I don't know'" },
  { key: '1-4', description: 'Select option (Choice mode)' },
  { key: 'Ctrl + D', description: 'Toggle dictation mode (Typing mode)' },
  { key: '?', description: 'Show shortcuts' },
];

export function LearnClient({ initialWords, stats }: LearnClientProps) {
  const { pronunciationAccent, settings, updateSettings } = useUserSettings();
  
  // Initialize mode from saved preference or default to 'typing'
  const [mode, setMode] = useState<LearningMode>(
    (settings?.preferredLearningMode as LearningMode) || 'typing'
  );
  const [words, setWords] = useState<LearningWord[]>(initialWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    correct: 0,
    incorrect: 0,
    totalTime: 0,
    wordsReviewed: 0,
    wpm: 0,
  });
  
  // Typing mode state
  const [typedValue, setTypedValue] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [errorCount, setErrorCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Multiple choice state
  const [options, setOptions] = useState<{ id: string; text: string; isCorrect: boolean }[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  
  // Real-time timer state
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Page visibility / blur state
  const [isPageBlurred, setIsPageBlurred] = useState(false);
  
  // Session recovery dialog
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [savedSession, setSavedSession] = useState<SessionState | null>(null);
  
  // Dictation mode (hide Chinese in typing mode)
  const [isDictationMode, setIsDictationMode] = useState(false);
  
  // Shortcuts help dialog
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  
  // Word detail state (for incorrect answers)
  const [wordOccurrences, setWordOccurrences] = useState<WordOccurrence[]>([]);
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);
  const [playingSentenceId, setPlayingSentenceId] = useState<string | null>(null);
  
  // Context Listening mode state - store context sentence per word index
  const [contextSentences, setContextSentences] = useState<Map<number, WordOccurrence>>(new Map());
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextPlayingAudio, setContextPlayingAudio] = useState(false);
  
  // Track which word indices have been auto-played to avoid replaying on re-renders
  const autoPlayedIndicesRef = useRef<Set<number>>(new Set());
  
  // Audio refs
  const youdaoAudioRef = useRef<HTMLAudioElement>(null);
  const sentenceAudioRef = useRef<HTMLAudioElement>(null);

  const currentWord = words[currentIndex];
  const progress = words.length > 0 ? ((currentIndex) / words.length) * 100 : 0;

  // Check for saved session on mount
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      try {
        const session: SessionState = JSON.parse(saved);
        // Check if session is less than 24 hours old and has same words
        const isRecent = Date.now() - session.timestamp < 24 * 60 * 60 * 1000;
        const isSameWords = session.wordIds.length === initialWords.length && 
          session.wordIds.every((id, i) => initialWords[i]?.id === id);
        
        if (isRecent && isSameWords && session.currentIndex > 0 && session.currentIndex < initialWords.length) {
          setSavedSession(session);
          setShowRecoveryDialog(true);
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }, [initialWords]);

  // Save session state periodically
  useEffect(() => {
    if (isComplete || currentIndex === 0) return;
    
    const sessionState: SessionState = {
      currentIndex,
      mode,
      sessionStats,
      wordIds: words.map(w => w.id),
      timestamp: Date.now(),
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionState));
  }, [currentIndex, mode, sessionStats, words, isComplete]);

  // Clear session on completion
  useEffect(() => {
    if (isComplete) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [isComplete]);

  // Real-time timer effect
  useEffect(() => {
    if (showResult || isComplete || isPageBlurred) return;
    
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);
    
    return () => clearInterval(interval);
  }, [startTime, showResult, isComplete, isPageBlurred]);

  // Page visibility detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPageBlurred(true);
      }
    };
    
    const handleBlur = () => {
      setIsPageBlurred(true);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Handle resume from blur
  const handleResume = useCallback(() => {
    setIsPageBlurred(false);
    setStartTime(Date.now());
    setElapsedTime(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Global keydown for blur overlay
  useEffect(() => {
    if (!isPageBlurred) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      handleResume();
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPageBlurred, handleResume]);

  // Play word pronunciation using Youdao API
  const playPronunciation = useCallback((text: string) => {
    if (!youdaoAudioRef.current) return;
    
    const audio = youdaoAudioRef.current;
    
    // type=1 for UK accent, type=2 for US accent
    const accentType = pronunciationAccent === 'uk' ? 1 : 2;
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${accentType}`;
    
    audio.src = audioUrl;
    audio.currentTime = 0;
    audio.play().catch(console.error);
  }, [pronunciationAccent]);

  // Play sentence audio
  const handlePlaySentence = useCallback((sentence: WordOccurrence['sentence']) => {
    if (!sentenceAudioRef.current) return;

    const audio = sentenceAudioRef.current;
    
    // Stop any current playback
    audio.pause();
    
    if (playingSentenceId === sentence.id) {
      setPlayingSentenceId(null);
      return;
    }

    const materialId = sentence.material_id || sentence.material?.id;
    const startTime = sentence.start_time ?? 0;
    const endTime = sentence.end_time ?? 0;

    if (!materialId) return;

    const src = `/api/materials/${materialId}/stream`;
    const fullSrc = window.location.origin + src;
    
    const playAudio = () => {
      audio.currentTime = startTime;
      audio.play().catch(console.error);
      setPlayingSentenceId(sentence.id);
    };

    if (audio.src !== fullSrc) {
      audio.src = src;
      audio.onloadedmetadata = () => {
        playAudio();
      };
    } else {
      playAudio();
    }
    
    const handleTimeUpdate = () => {
      if (audio.currentTime >= endTime) {
        audio.pause();
        setPlayingSentenceId(null);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.onloadedmetadata = null;
      }
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    
    audio.onpause = () => {
      if (!audio.seeking && (audio.currentTime >= endTime || audio.ended || audio.paused)) {
        setPlayingSentenceId(null);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.onloadedmetadata = null;
      }
    };
  }, [playingSentenceId]);

  // Load multiple choice options
  const loadOptions = useCallback(async (word: LearningWord) => {
    setIsLoadingOptions(true);
    const { words: randomWords } = await getRandomWords([word.wordId], 3);
    
    const allOptions = [
      { id: word.wordId, text: word.text, isCorrect: true },
      ...randomWords.map(w => ({ id: w.id, text: w.text, isCorrect: false })),
    ].sort(() => Math.random() - 0.5);
    
    setOptions(allOptions);
    setIsLoadingOptions(false);
  }, []);

  // Load context sentence for a specific word in context listening mode
  const loadContextForWord = useCallback(async (wordIndex: number) => {
    const word = words[wordIndex];
    if (!word || contextSentences.has(wordIndex)) return;
    
    setIsLoadingContext(true);
    try {
      const result = await getWordContext(word.wordId);
      if (result.occurrences && result.occurrences.length > 0) {
        // Get the first occurrence that has audio
        const occ = result.occurrences.find(o => 
          o.sentence?.material_id && 
          o.sentence?.start_time !== undefined
        ) || result.occurrences[0];
        
        if (occ) {
          setContextSentences(prev => {
            const newMap = new Map(prev);
            newMap.set(wordIndex, occ);
            return newMap;
          });
        }
      }
    } catch (error) {
      console.error('Error loading context for word:', error);
    } finally {
      setIsLoadingContext(false);
    }
  }, [words, contextSentences]);

  // Play sentence audio for context listening
  const playContextSentenceFromOccurrence = useCallback((occ: WordOccurrence) => {
    if (!sentenceAudioRef.current) return;

    const audio = sentenceAudioRef.current;
    
    // Stop any current playback
    audio.pause();
    
    if (contextPlayingAudio) {
      setContextPlayingAudio(false);
      return;
    }

    const materialId = occ.sentence.material_id || occ.sentence.material?.id;
    const startTime = occ.sentence.start_time ?? 0;
    const endTime = occ.sentence.end_time ?? 0;

    if (!materialId) return;

    const src = `/api/materials/${materialId}/stream`;
    const fullSrc = window.location.origin + src;
    
    const playAudio = () => {
      audio.currentTime = startTime;
      audio.play().catch(console.error);
      setContextPlayingAudio(true);
    };

    if (audio.src !== fullSrc) {
      audio.src = src;
      audio.onloadedmetadata = () => {
        playAudio();
      };
    } else {
      playAudio();
    }
    
    const handleTimeUpdate = () => {
      if (audio.currentTime >= endTime) {
        audio.pause();
        setContextPlayingAudio(false);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.onloadedmetadata = null;
      }
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    
    audio.onpause = () => {
      if (!audio.seeking && (audio.currentTime >= endTime || audio.ended || audio.paused)) {
        setContextPlayingAudio(false);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.onloadedmetadata = null;
      }
    };
  }, [contextPlayingAudio]);

  // Load context for current word when mode changes to context_listening
  useEffect(() => {
    if (mode === 'context_listening' && currentWord) {
      loadContextForWord(currentIndex);
    }
  }, [mode, currentIndex, currentWord, loadContextForWord]);

  // Auto-play audio when context sentence is loaded in context_listening mode
  useEffect(() => {
    if (mode === 'context_listening' && !isLoadingContext && !showResult) {
      const ctxOcc = contextSentences.get(currentIndex);
      // Only auto-play if we haven't auto-played this word yet
      if (ctxOcc && ctxOcc.sentence && !autoPlayedIndicesRef.current.has(currentIndex)) {
        // Mark as auto-played to prevent replay
        autoPlayedIndicesRef.current.add(currentIndex);
        // Small delay to ensure UI is ready
        const timer = setTimeout(() => {
          playContextSentenceFromOccurrence(ctxOcc);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [mode, currentIndex, contextSentences, isLoadingContext, showResult, playContextSentenceFromOccurrence]);

  // Load word context (sentences) for incorrect answers
  const loadWordContext = useCallback(async (wordId: string) => {
    setLoadingOccurrences(true);
    try {
      const result = await getWordContext(wordId);
      if (result.occurrences) {
        setWordOccurrences(result.occurrences);
      }
    } catch (error) {
      console.error('Error loading word context:', error);
    } finally {
      setLoadingOccurrences(false);
    }
  }, []);

  // Reset for next word
  const resetForNextWord = useCallback((targetIndex?: number) => {
    setTypedValue('');
    setShowResult(false);
    setIsCorrect(false);
    setSelectedOption(null);
    setErrorCount(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    setWordOccurrences([]);
    setPlayingSentenceId(null);
    
    // Stop any playing audio when switching words
    if (sentenceAudioRef.current) {
      sentenceAudioRef.current.pause();
      sentenceAudioRef.current.onloadedmetadata = null;
    }
    setContextPlayingAudio(false);
    
    const nextIndex = targetIndex !== undefined ? targetIndex : currentIndex + 1;
    if (mode === 'multiple_choice' && words[nextIndex]) {
      loadOptions(words[nextIndex]);
    }
    
    // Auto-play pronunciation in dictation mode
    if (isDictationMode && words[nextIndex]) {
      setTimeout(() => playPronunciation(words[nextIndex].text), 300);
    }
    
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [mode, words, currentIndex, loadOptions, isDictationMode, playPronunciation]);

  // Move to next word - defined early to be used in other callbacks
  const nextWord = useCallback(() => {
    if (currentIndex >= words.length - 1) {
      setIsComplete(true);
      return;
    }
    setCurrentIndex(prev => prev + 1);
    resetForNextWord(currentIndex + 1);
  }, [currentIndex, words.length, resetForNextWord]);

  // Move to previous word
  const prevWord = useCallback(() => {
    if (currentIndex <= 0) return;
    setCurrentIndex(prev => prev - 1);
    resetForNextWord(currentIndex - 1);
  }, [currentIndex, resetForNextWord]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: LearningMode) => {
    setMode(newMode);
    if (newMode === 'multiple_choice' && currentWord) {
      loadOptions(currentWord);
    }
    // Context listening mode will load context via useEffect when mode changes
    setTypedValue('');
    setShowResult(false);
    setSelectedOption(null);
    setContextPlayingAudio(false);
    setTimeout(() => inputRef.current?.focus(), 100);
    
    // Save preferred mode to user settings
    updateSettings({ preferredLearningMode: newMode });
  }, [currentWord, loadOptions, updateSettings]);

  // Initialize options for multiple choice
  useEffect(() => {
    if (mode === 'multiple_choice' && currentWord && options.length === 0) {
      loadOptions(currentWord);
    }
  }, [mode, currentWord, options.length, loadOptions]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle typing submission
  const handleTypingSubmit = useCallback(async () => {
    // All modes use the same currentWord now
    if (!currentWord || showResult) return;

    const trimmedValue = typedValue.trim().toLowerCase();
    const correctAnswer = currentWord.text.toLowerCase();
    const correct = trimmedValue === correctAnswer;
    
    setIsCorrect(correct);
    setShowResult(true);

    const responseTime = Date.now() - startTime;
    
    // Record the review
    const result = await recordReview({
      userWordStatusId: currentWord.id,
      isCorrect: correct,
      responseTimeMs: responseTime,
      errorCount: correct ? 0 : errorCount + 1,
      mode: mode === 'context_listening' ? 'context_listening' : 'typing',
    });

    if (!result.success) {
      toast.error('Failed to record review');
    }

    // Update session stats
    setSessionStats(prev => ({
      ...prev,
      correct: prev.correct + (correct ? 1 : 0),
      incorrect: prev.incorrect + (correct ? 0 : 1),
      totalTime: prev.totalTime + responseTime,
      wordsReviewed: prev.wordsReviewed + 1,
      wpm: Math.round((prev.wordsReviewed + 1) / ((prev.totalTime + responseTime) / 60000)),
    }));

    // If correct, advance quickly; if incorrect, load word context and stay
    if (correct) {
      setTimeout(() => {
        nextWord();
      }, 300); // Quick advance for correct answers
    } else if (mode !== 'context_listening') {
      // Load word context for learning (only for non-context-listening modes)
      loadWordContext(currentWord.wordId);
    }
  }, [currentWord, mode, typedValue, showResult, startTime, errorCount, nextWord, loadWordContext]);

  // Handle multiple choice selection
  const handleOptionSelect = useCallback(async (optionId: string) => {
    if (!currentWord || selectedOption) return;

    setSelectedOption(optionId);
    const correct = optionId === currentWord.wordId;
    setIsCorrect(correct);
    setShowResult(true);

    const responseTime = Date.now() - startTime;

    // Record the review
    const result = await recordReview({
      userWordStatusId: currentWord.id,
      isCorrect: correct,
      responseTimeMs: responseTime,
      errorCount: correct ? 0 : 1,
      mode: 'multiple_choice',
    });

    if (!result.success) {
      toast.error('Failed to record review');
    }

    // Update session stats
    setSessionStats(prev => ({
      ...prev,
      correct: prev.correct + (correct ? 1 : 0),
      incorrect: prev.incorrect + (correct ? 0 : 1),
      totalTime: prev.totalTime + responseTime,
      wordsReviewed: prev.wordsReviewed + 1,
      wpm: Math.round((prev.wordsReviewed + 1) / ((prev.totalTime + responseTime) / 60000)),
    }));
    
    // If correct, advance quickly; if incorrect, load word context and stay
    if (correct) {
      setTimeout(() => {
        nextWord();
      }, 300);
    } else {
      loadWordContext(currentWord.wordId);
    }
  }, [currentWord, selectedOption, startTime, nextWord, loadWordContext]);

  // Handle "I don't know" button
  const handleDontKnow = useCallback(async () => {
    // All modes use the same currentWord now
    if (!currentWord || showResult) return;

    setIsCorrect(false);
    setShowResult(true);
    setSelectedOption('dont-know');

    const responseTime = Date.now() - startTime;

    // Record as incorrect with Again rating
    const result = await recordReview({
      userWordStatusId: currentWord.id,
      isCorrect: false,
      responseTimeMs: responseTime,
      errorCount: 1,
      mode: mode === 'context_listening' ? 'context_listening' : mode,
    });

    if (!result.success) {
      toast.error('Failed to record review');
    }

    setSessionStats(prev => ({
      ...prev,
      incorrect: prev.incorrect + 1,
      totalTime: prev.totalTime + responseTime,
      wordsReviewed: prev.wordsReviewed + 1,
    }));
    
    // Load word context for learning (don't auto-advance) - only for non-context-listening modes
    if (mode !== 'context_listening') {
      loadWordContext(currentWord.wordId);
    }
  }, [currentWord, showResult, startTime, mode, loadWordContext]);

  // Handle key press
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't handle shortcuts when blurred
    if (isPageBlurred) return;
    
    // Shift + Arrow key navigation (to avoid conflicts with typing)
    if (e.shiftKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      prevWord();
      return;
    }
    if (e.shiftKey && e.key === 'ArrowRight') {
      e.preventDefault();
      nextWord();
      return;
    }
    
    // Tab for pronunciation / replay sentence
    if (e.key === 'Tab') {
      e.preventDefault();
      if (mode === 'context_listening') {
        const ctxOcc = contextSentences.get(currentIndex);
        if (ctxOcc) {
          playContextSentenceFromOccurrence(ctxOcc);
        }
      } else if (currentWord) {
        playPronunciation(currentWord.text);
      }
      return;
    }
    
    // Ctrl+S for "I don't know" (to avoid conflicts with typing 's')
    if (e.ctrlKey && (e.key === 's' || e.key === 'S') && !showResult) {
      e.preventDefault();
      handleDontKnow();
      return;
    }
    
    // Ctrl+D for dictation mode toggle (typing mode only)
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D') && mode === 'typing' && !showResult) {
      e.preventDefault();
      setIsDictationMode(prev => !prev);
      if (!isDictationMode && currentWord) {
        // If entering dictation mode, play pronunciation
        setTimeout(() => playPronunciation(currentWord.text), 100);
      }
      return;
    }
    
    // ? for help
    if (e.key === '?') {
      e.preventDefault();
      setShowShortcutsHelp(true);
      return;
    }
    
    // Number keys for choice mode
    if (mode === 'multiple_choice' && !showResult && options.length > 0) {
      const num = parseInt(e.key);
      if (num >= 1 && num <= options.length) {
        e.preventDefault();
        handleOptionSelect(options[num - 1].id);
        return;
      }
    }
    
    if (e.key === 'Enter') {
      if (showResult) {
        nextWord();
      } else if (mode === 'typing') {
        handleTypingSubmit();
      }
    }
  }, [isPageBlurred, showResult, mode, nextWord, prevWord, handleTypingSubmit, handleDontKnow, 
      currentWord, playPronunciation, isDictationMode, options, handleOptionSelect, 
      contextSentences, currentIndex, playContextSentenceFromOccurrence]);

  // Handle typing input change with real-time validation
  const handleTypingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTypedValue(value);
    
    // In all modes, use currentWord (same words for all modes now)
    if (!currentWord) return;
    
    // Track errors (wrong characters)
    if (value.length > 0) {
      const correctPart = currentWord.text.substring(0, value.length).toLowerCase();
      if (value.toLowerCase() !== correctPart) {
        setErrorCount(prev => prev + 1);
      }
    }
    
    // Auto-submit when the word is complete
    if (value.length === currentWord.text.length) {
      // Small delay to show the last character before submitting
      setTimeout(async () => {
        if (!showResult) {
          const trimmedValue = value.trim().toLowerCase();
          const correctAnswer = currentWord.text.toLowerCase();
          const correct = trimmedValue === correctAnswer;
          
          setIsCorrect(correct);
          setShowResult(true);

          const responseTime = Date.now() - startTime;
          
          // Record the review
          const result = await recordReview({
            userWordStatusId: currentWord.id,
            isCorrect: correct,
            responseTimeMs: responseTime,
            errorCount: correct ? 0 : errorCount + 1,
            mode: mode === 'context_listening' ? 'context_listening' : 'typing',
          });

          if (!result.success) {
            toast.error('Failed to record review');
          }

          // Update session stats
          setSessionStats(prev => ({
            ...prev,
            correct: prev.correct + (correct ? 1 : 0),
            incorrect: prev.incorrect + (correct ? 0 : 1),
            totalTime: prev.totalTime + responseTime,
            wordsReviewed: prev.wordsReviewed + 1,
            wpm: Math.round((prev.wordsReviewed + 1) / ((prev.totalTime + responseTime) / 60000)),
          }));
          
          // If correct, advance quickly; if incorrect, load context and stay
          if (correct) {
            setTimeout(() => {
              nextWord();
            }, 300);
          } else if (mode !== 'context_listening') {
            // Only load word context for non-context-listening modes
            loadWordContext(currentWord.wordId);
          }
        }
      }, 100);
    }
  };

  // Handle session recovery
  const handleRecoverSession = () => {
    if (savedSession) {
      setCurrentIndex(savedSession.currentIndex);
      setMode(savedSession.mode);
      setSessionStats(savedSession.sessionStats);
      if (savedSession.mode === 'multiple_choice' && words[savedSession.currentIndex]) {
        loadOptions(words[savedSession.currentIndex]);
      }
    }
    setShowRecoveryDialog(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleStartFresh = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setShowRecoveryDialog(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Format elapsed time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  // Render blur overlay
  if (isPageBlurred && !isComplete) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md cursor-pointer"
        onClick={handleResume}
      >
        <div className="text-center">
          <Pause className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Paused</h2>
          <p className="text-muted-foreground">Press any key or click to continue</p>
        </div>
      </div>
    );
  }

  // Render completion screen
  if (isComplete) {
    const accuracy = sessionStats.wordsReviewed > 0 
      ? Math.round((sessionStats.correct / sessionStats.wordsReviewed) * 100) 
      : 0;
    
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Trophy className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Session Complete!</h2>
              <p className="text-muted-foreground mb-6">
                Great job! You&apos;ve finished your learning session.
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{sessionStats.correct}</div>
                  <div className="text-sm text-muted-foreground">Correct</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{sessionStats.incorrect}</div>
                  <div className="text-sm text-muted-foreground">Incorrect</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{accuracy}%</div>
                  <div className="text-sm text-muted-foreground">Accuracy</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{Math.round(sessionStats.totalTime / 1000)}s</div>
                  <div className="text-sm text-muted-foreground">Total Time</div>
                </div>
              </div>

              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => window.location.href = '/vocab'}>
                  Back to Vocabulary
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Learn More
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Session Recovery Dialog */}
      <Dialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume Previous Session?</DialogTitle>
            <DialogDescription>
              You have an unfinished learning session. Would you like to continue where you left off?
            </DialogDescription>
          </DialogHeader>
          {savedSession && (
            <div className="py-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Progress: {savedSession.currentIndex} / {savedSession.wordIds.length} words</p>
                <p>Correct: {savedSession.sessionStats.correct} | Incorrect: {savedSession.sessionStats.incorrect}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleStartFresh}>
              Start Fresh
            </Button>
            <Button onClick={handleRecoverSession}>
              Resume Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortcuts Help Dialog */}
      <Dialog open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-3">
              {SHORTCUTS.map((shortcut, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">{shortcut.key}</kbd>
                  <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mode Toggle in Header */}
      <HeaderPortal>
        <div className="flex items-center gap-2">
          <Tabs value={mode} onValueChange={(value) => handleModeChange(value as LearningMode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="typing" className="flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                <span className="hidden sm:inline">Typing</span>
              </TabsTrigger>
              <TabsTrigger value="multiple_choice" className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                <span className="hidden sm:inline">Choice</span>
              </TabsTrigger>
              <TabsTrigger value="context_listening" className="flex items-center gap-2">
                <Headphones className="h-4 w-4" />
                <span className="hidden sm:inline">Context</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setShowShortcutsHelp(true)}
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </HeaderPortal>
      
      {/* Stats Bar */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              <span>{stats.totalNew + stats.totalLearning} to learn</span>
            </div>
            <div className="flex items-center gap-1">
              <Target className="h-4 w-4" />
              <span>{stats.dueToday} due today</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {currentIndex + 1} / {words.length}
          </div>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Word Card with Navigation Arrows */}
      <div className="flex items-center gap-4 w-full max-w-3xl">
        {/* Left Arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={prevWord}
          disabled={currentIndex <= 0}
          title="Previous word (Shift+←)"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        {/* Fixed size card */}
        <Card className="w-full max-w-2xl min-h-[400px] flex flex-col">
          <CardContent className="pt-6 flex-1 flex flex-col">
            {/* Context Listening Mode */}
            {mode === 'context_listening' ? (
              (() => {
                const ctxOcc = contextSentences.get(currentIndex);
                
                if (isLoadingContext) {
                  return (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-muted-foreground">Loading context sentence...</span>
                    </div>
                  );
                }
                
                if (!ctxOcc || !ctxOcc.sentence) {
                  return (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <Headphones className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No context sentence available for this word.</p>
                      <p className="text-sm text-muted-foreground mt-2">Try switching to Typing or Choice mode.</p>
                      <Button 
                        variant="outline" 
                        className="mt-4"
                        onClick={nextWord}
                      >
                        Skip to Next Word
                      </Button>
                    </div>
                  );
                }
                
                // Create sentence with blank for the target word
                const sentenceContent = ctxOcc.sentence.content;
                const wordText = currentWord.text;
                
                // Use start_index and end_index if available to get the original word form
                // This handles cases where the word is in a different form (e.g., "farming" vs "farm")
                let originalWordInSentence = wordText;
                let sentenceWithBlank = sentenceContent;
                
                if (ctxOcc.start_index !== undefined && ctxOcc.end_index !== undefined && 
                    ctxOcc.start_index >= 0 && ctxOcc.end_index > ctxOcc.start_index) {
                  // Use the indices to extract the original word form and create blank
                  originalWordInSentence = sentenceContent.substring(ctxOcc.start_index, ctxOcc.end_index);
                  sentenceWithBlank = sentenceContent.substring(0, ctxOcc.start_index) + 
                    '______' + 
                    sentenceContent.substring(ctxOcc.end_index);
                } else {
                  // Fallback: try to match the word using regex (case insensitive)
                  const wordRegex = new RegExp(`\\b${wordText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                  const match = sentenceContent.match(wordRegex);
                  if (match) {
                    originalWordInSentence = match[0];
                    sentenceWithBlank = sentenceContent.replace(wordRegex, '______');
                  }
                }
                
                return (
                  <>
                    {/* Sentence Audio Player */}
                    <div className="text-center mb-6 flex-shrink-0">
                      <div className="flex items-center justify-center gap-3 mb-4">
                        <Button
                          variant={contextPlayingAudio ? "default" : "outline"}
                          size="lg"
                          className="h-14 w-14 rounded-full"
                          onClick={() => playContextSentenceFromOccurrence(ctxOcc)}
                          title="Play sentence (Tab)"
                        >
                          {contextPlayingAudio ? (
                            <Pause className="h-6 w-6" />
                          ) : (
                            <Play className="h-6 w-6 ml-1" />
                          )}
                        </Button>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mb-2">
                        From: {ctxOcc.sentence.material?.title || 'Material'}
                      </p>
                      
                      {/* Show sentence with blank */}
                      <div className="text-base md:text-lg font-medium min-h-[60px] flex items-center justify-center px-2 md:px-4">
                        <ScrollArea className="max-h-[150px] w-full">
                          <p className="text-center leading-relaxed break-words">
                          {showResult ? (
                            (() => {
                              // Highlight the original word in the sentence
                              if (ctxOcc.start_index !== undefined && ctxOcc.end_index !== undefined && 
                                  ctxOcc.start_index >= 0 && ctxOcc.end_index > ctxOcc.start_index) {
                                const before = sentenceContent.substring(0, ctxOcc.start_index);
                                const word = sentenceContent.substring(ctxOcc.start_index, ctxOcc.end_index);
                                const after = sentenceContent.substring(ctxOcc.end_index);
                                return (
                                  <span>
                                    {before}
                                    <span className="font-bold text-primary bg-primary/10 rounded px-1">{word}</span>
                                    {after}
                                  </span>
                                );
                              }
                              // Fallback: highlight using the originalWordInSentence
                              const highlightRegex = new RegExp(`\\b${originalWordInSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                              return (
                                <span dangerouslySetInnerHTML={{
                                  __html: sentenceContent.replace(
                                    highlightRegex,
                                    `<span class="font-bold text-primary bg-primary/10 rounded px-1">${originalWordInSentence}</span>`
                                  )
                                }} />
                              );
                            })()
                          ) : (
                            sentenceWithBlank
                          )}
                          </p>
                        </ScrollArea>
                      </div>
                    </div>
                    
                    {/* Answer Input */}
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="space-y-4">
                        {/* Hidden input to capture keyboard events */}
                        <input
                          ref={inputRef}
                          value={typedValue}
                          onChange={handleTypingChange}
                          className="sr-only"
                          disabled={showResult}
                          autoComplete="off"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-label="Type the missing word"
                        />
                        
                        {/* Typing Input with Letter Underlines */}
                        <div 
                          className="flex justify-center mb-4 cursor-text" 
                          onClick={() => inputRef.current?.focus()}
                        >
                          <div className="flex gap-1 flex-wrap justify-center">
                            {currentWord.text.split('').map((letter, i) => {
                              const typedChar = typedValue[i];
                              const isTyped = typedChar !== undefined;
                              const isCorrectChar = typedChar?.toLowerCase() === letter.toLowerCase();
                              
                              return (
                                <div
                                  key={i}
                                  className={cn(
                                    "w-8 h-10 border-b-2 flex items-center justify-center text-lg font-mono",
                                    showResult && !isCorrect && !isCorrectChar && isTyped
                                      ? "border-red-500 text-red-500"
                                      : showResult && isCorrect
                                      ? "border-green-500 text-green-600"
                                      : isTyped
                                      ? isCorrectChar
                                        ? "border-primary text-foreground"
                                        : "border-red-500 text-red-500"
                                      : "border-muted-foreground/30"
                                  )}
                                >
                                  {showResult ? letter : typedChar || ''}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {!showResult && (
                          <div className="flex justify-center gap-3">
                            <Button 
                              variant="outline" 
                              onClick={() => playContextSentenceFromOccurrence(ctxOcc)}
                              title="Replay sentence (Tab)"
                            >
                              <Volume2 className="mr-2 h-4 w-4" />
                              Replay
                            </Button>
                            <Button variant="outline" onClick={handleDontKnow} title="I don't know (Ctrl+S)">
                              <SkipForward className="mr-2 h-4 w-4" />
                              I don&apos;t know
                            </Button>
                          </div>
                        )}
                        
                        {/* Result Feedback for Context Listening */}
                        {showResult && (
                          <div className={cn(
                            "mt-4 p-4 rounded-lg",
                            isCorrect ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"
                          )}>
                            <div className="flex items-center justify-center gap-2 mb-2">
                              {isCorrect ? (
                                <Check className="h-5 w-5 text-green-600" />
                              ) : (
                                <X className="h-5 w-5 text-red-600" />
                              )}
                              <span className={cn(
                                "font-semibold",
                                isCorrect ? "text-green-600" : "text-red-600"
                              )}>
                                {isCorrect ? 'Correct!' : 'Incorrect'}
                              </span>
                            </div>
                            
                            {!isCorrect && (
                              <div className="space-y-3">
                                <p className="text-sm text-center text-muted-foreground">
                                  The correct answer is: <strong className="text-foreground">{currentWord.text}</strong>
                                  {currentWord.phonetic && <span className="ml-2">[{currentWord.phonetic}]</span>}
                                </p>
                                
                                {currentWord.translation && (
                                  <p className="text-sm text-center">
                                    {currentWord.translation}
                                  </p>
                                )}
                                
                                {/* Manual next button for incorrect answers */}
                                <div className="flex justify-center pt-2">
                                  <Button onClick={nextWord} size="sm">
                                    Next Word
                                    <ChevronRight className="ml-1 h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                {/* Definition/Translation for typing and multiple choice modes */}
                <div className="text-center mb-6 flex-shrink-0">
                  {/* Phonetic and pronunciation */}
                  {mode === 'typing' && (
                    <div className="flex items-center justify-center gap-2 mb-2">
                      {currentWord.phonetic && !isDictationMode && (
                        <span className="text-sm text-muted-foreground">{currentWord.phonetic}</span>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => playPronunciation(currentWord.text)}
                        title="Play pronunciation (Tab)"
                      >
                        <Volume2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-6 w-6", isDictationMode && "text-primary bg-primary/10")}
                        onClick={() => {
                          setIsDictationMode(prev => !prev);
                          if (!isDictationMode) {
                            playPronunciation(currentWord.text);
                          }
                        }}
                        title="Toggle dictation mode (Ctrl+D)"
                      >
                        {isDictationMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                  
                  {/* Translation/Definition - hide in dictation mode */}
                  {!isDictationMode ? (
                    <div className="text-xl md:text-2xl font-medium mb-2 min-h-[60px] flex items-center justify-center">
                      <ScrollArea className="max-h-[100px]">
                        {currentWord.translation || currentWord.definition || 'No definition'}
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="text-xl md:text-2xl font-medium mb-2 min-h-[60px] flex items-center justify-center text-muted-foreground/50">
                      Dictation Mode - Listen and type
                    </div>
                  )}
                </div>

                {/* Answer Area - flex-1 to fill remaining space */}
                <div className="flex-1 flex flex-col justify-center">
                  {mode === 'typing' ? (
                <div className="space-y-4">
                  {/* Hidden input to capture keyboard events */}
                  <input
                    ref={inputRef}
                    value={typedValue}
                    onChange={handleTypingChange}
                    className="sr-only"
                    disabled={showResult}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Type the word"
                  />
                  
                  {/* Typing Input with Letter Underlines */}
                  <div 
                    className="flex justify-center mb-4 cursor-text" 
                    onClick={() => inputRef.current?.focus()}
                  >
                    <div className="flex gap-1 flex-wrap justify-center">
                      {currentWord.text.split('').map((letter, i) => {
                        const typedChar = typedValue[i];
                        const isTyped = typedChar !== undefined;
                        const isCorrectChar = typedChar?.toLowerCase() === letter.toLowerCase();
                        
                        return (
                          <div
                            key={i}
                            className={cn(
                              "w-8 h-10 border-b-2 flex items-center justify-center text-lg font-mono",
                              showResult && !isCorrect && !isCorrectChar && isTyped
                                ? "border-red-500 text-red-500"
                                : showResult && isCorrect
                                ? "border-green-500 text-green-600"
                                : isTyped
                                ? isCorrectChar
                                  ? "border-primary text-foreground"
                                  : "border-red-500 text-red-500"
                                : "border-muted-foreground/30"
                            )}
                          >
                            {showResult ? letter : typedChar || ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!showResult && (
                    <div className="flex justify-center gap-3">
                      <Button variant="outline" onClick={handleDontKnow} title="I don't know (Ctrl+S)">
                        <SkipForward className="mr-2 h-4 w-4" />
                        I don&apos;t know
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {isLoadingOptions ? (
                    <div className="flex justify-center p-8">
                      <span className="text-muted-foreground">Loading options...</span>
                    </div>
                  ) : (
                    <>
                      {options.map((option, idx) => (
                        <Button
                          key={option.id}
                          variant={
                            selectedOption === option.id
                              ? option.isCorrect
                                ? 'default'
                                : 'destructive'
                              : showResult && option.isCorrect
                              ? 'default'
                              : 'outline'
                          }
                          className={cn(
                            "w-full justify-start text-left h-auto py-3 px-4",
                            showResult && option.isCorrect && "bg-green-600 hover:bg-green-600",
                            selectedOption === option.id && !option.isCorrect && "bg-red-600 hover:bg-red-600"
                          )}
                          onClick={() => handleOptionSelect(option.id)}
                          disabled={!!selectedOption}
                          title={`Press ${idx + 1} to select`}
                        >
                          <span className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center mr-3 text-sm">
                            {idx + 1}
                          </span>
                          <span className="font-medium">{option.text}</span>
                          {showResult && option.isCorrect && (
                            <Check className="ml-auto h-4 w-4" />
                          )}
                          {selectedOption === option.id && !option.isCorrect && (
                            <X className="ml-auto h-4 w-4" />
                          )}
                        </Button>
                      ))}
                      
                      {!showResult && (
                        <Button
                          variant="ghost"
                          className="w-full text-muted-foreground"
                          onClick={handleDontKnow}
                          title="I don't know (Ctrl+S)"
                        >
                          I don&apos;t know
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Result Feedback */}
            {showResult && (
              <div className={cn(
                "mt-4 p-4 rounded-lg",
                isCorrect ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"
              )}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {isCorrect ? (
                    <Check className="h-5 w-5 text-green-600" />
                  ) : (
                    <X className="h-5 w-5 text-red-600" />
                  )}
                  <span className={cn(
                    "font-semibold",
                    isCorrect ? "text-green-600" : "text-red-600"
                  )}>
                    {isCorrect ? 'Correct!' : 'Incorrect'}
                  </span>
                </div>
                
                {!isCorrect && (
                  <div className="space-y-3">
                    <p className="text-sm text-center text-muted-foreground">
                      The correct answer is: <strong className="text-foreground">{currentWord.text}</strong>
                      {currentWord.phonetic && <span className="ml-2">[{currentWord.phonetic}]</span>}
                    </p>
                    
                    {/* Full word info for incorrect answers */}
                    {currentWord.translation && (
                      <p className="text-sm text-center">
                        {currentWord.translation}
                      </p>
                    )}
                    
                    {/* Context sentence - only show for typing and multiple choice modes */}
                    {loadingOccurrences ? (
                      <div className="text-sm text-center text-muted-foreground">Loading example...</div>
                    ) : wordOccurrences.length > 0 && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground uppercase mb-2">Example sentence:</p>
                        <div 
                          className="flex items-start gap-2 cursor-pointer hover:bg-muted rounded p-1 -m-1"
                          onClick={() => handlePlaySentence(wordOccurrences[0].sentence)}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                            playingSentenceId === wordOccurrences[0].sentence.id 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted-foreground/20"
                          )}>
                            {playingSentenceId === wordOccurrences[0].sentence.id 
                              ? <Pause className="w-3 h-3" /> 
                              : <Play className="w-3 h-3 ml-0.5" />}
                          </div>
                          <p 
                            className="text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: wordOccurrences[0].sentence.content.replace(
                                new RegExp(`\\b(${currentWord.text})\\b`, 'gi'),
                                '<span class="font-bold text-primary bg-primary/10 rounded px-0.5">$1</span>'
                              )
                            }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Manual next button for incorrect answers */}
                    <div className="flex justify-center pt-2">
                      <Button onClick={nextWord} size="sm">
                        Next Word
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Right Arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={nextWord}
          disabled={currentIndex >= words.length - 1}
          title="Next word (Shift+→)"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {/* Session Stats - Real-time timer */}
      <div className="flex items-center gap-6 mt-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span className="font-mono tabular-nums">{formatTime(elapsedTime)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-green-600">{sessionStats.correct}</span>
          <span>/</span>
          <span className="text-red-600">{sessionStats.incorrect}</span>
        </div>
        {sessionStats.wordsReviewed > 0 && (
          <div>
            {Math.round((sessionStats.correct / sessionStats.wordsReviewed) * 100)}% accuracy
          </div>
        )}
      </div>
      
      {/* Hidden Audio Elements */}
      <audio ref={youdaoAudioRef} className="hidden" />
      <audio ref={sentenceAudioRef} className="hidden" />
    </div>
  );
}
