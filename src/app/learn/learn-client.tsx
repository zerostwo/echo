'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LearningWord, recordReview, getRandomWords } from '@/actions/learning-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeaderPortal } from '@/components/header-portal';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type LearningMode = 'typing' | 'multiple_choice';

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

export function LearnClient({ initialWords, stats }: LearnClientProps) {
  const [mode, setMode] = useState<LearningMode>('typing');
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

  const currentWord = words[currentIndex];
  const progress = words.length > 0 ? ((currentIndex) / words.length) * 100 : 0;

  // Play word pronunciation using browser TTS
  const playPronunciation = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      
      // Try to find an English voice
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => 
        voice.lang.startsWith('en') && voice.name.includes('English')
      ) || voices.find(voice => voice.lang.startsWith('en'));
      
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    } else {
      toast.error('Speech synthesis not supported in this browser');
    }
  }, []);

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

  // Reset for next word
  const resetForNextWord = useCallback((targetIndex?: number) => {
    setTypedValue('');
    setShowResult(false);
    setIsCorrect(false);
    setSelectedOption(null);
    setErrorCount(0);
    setStartTime(Date.now());
    
    const nextIndex = targetIndex !== undefined ? targetIndex : currentIndex + 1;
    if (mode === 'multiple_choice' && words[nextIndex]) {
      loadOptions(words[nextIndex]);
    }
    
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [mode, words, currentIndex, loadOptions]);

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
    setTypedValue('');
    setShowResult(false);
    setSelectedOption(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentWord, loadOptions]);

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
      mode: 'typing',
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
  }, [currentWord, typedValue, showResult, startTime, errorCount]);

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
    
    // Auto-advance after a short delay
    setTimeout(() => {
      nextWord();
    }, 1500);
  }, [currentWord, selectedOption, startTime, nextWord]);

  // Handle "I don't know" button
  const handleDontKnow = useCallback(async () => {
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
      mode,
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
    
    // Auto-advance after a short delay
    setTimeout(() => {
      nextWord();
    }, 1500);
  }, [currentWord, showResult, startTime, mode, nextWord]);

  // Handle key press
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Arrow key navigation
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevWord();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextWord();
      return;
    }
    
    if (e.key === 'Enter') {
      if (showResult) {
        nextWord();
      } else if (mode === 'typing') {
        handleTypingSubmit();
      }
    }
  }, [showResult, mode, nextWord, prevWord, handleTypingSubmit]);

  // Handle typing input change with real-time validation
  const handleTypingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTypedValue(value);
    
    // Track errors (wrong characters)
    if (currentWord && value.length > 0) {
      const correctPart = currentWord.text.substring(0, value.length).toLowerCase();
      if (value.toLowerCase() !== correctPart) {
        setErrorCount(prev => prev + 1);
      }
    }
    
    // Auto-submit when the word is complete
    if (currentWord && value.length === currentWord.text.length) {
      // Small delay to show the last character before submitting
      setTimeout(() => {
        if (!showResult) {
          const trimmedValue = value.trim().toLowerCase();
          const correctAnswer = currentWord.text.toLowerCase();
          const correct = trimmedValue === correctAnswer;
          
          setIsCorrect(correct);
          setShowResult(true);

          const responseTime = Date.now() - startTime;
          
          // Record the review
          recordReview({
            userWordStatusId: currentWord.id,
            isCorrect: correct,
            responseTimeMs: responseTime,
            errorCount: correct ? 0 : errorCount + 1,
            mode: 'typing',
          }).then(result => {
            if (!result.success) {
              toast.error('Failed to record review');
            }
          });

          // Update session stats
          setSessionStats(prev => ({
            ...prev,
            correct: prev.correct + (correct ? 1 : 0),
            incorrect: prev.incorrect + (correct ? 0 : 1),
            totalTime: prev.totalTime + responseTime,
            wordsReviewed: prev.wordsReviewed + 1,
            wpm: Math.round((prev.wordsReviewed + 1) / ((prev.totalTime + responseTime) / 60000)),
          }));
          
          // Auto-advance after a short delay
          setTimeout(() => {
            nextWord();
          }, 1500);
        }
      }, 100);
    }
  };

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
      {/* Mode Toggle in Header */}
      <HeaderPortal>
        <Tabs value={mode} onValueChange={(value) => handleModeChange(value as LearningMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="typing" className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Typing
            </TabsTrigger>
            <TabsTrigger value="multiple_choice" className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Choice
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            {/* Definition/Translation */}
            <div className="text-center mb-8">
              {/* Only show phonetic in typing mode */}
              {mode === 'typing' && currentWord.phonetic && (
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">{currentWord.phonetic}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => playPronunciation(currentWord.text)}
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              <div className="text-xl md:text-2xl font-medium mb-2">
                {currentWord.translation || currentWord.definition || 'No definition'}
              </div>
              
              {currentWord.pos && (
                <Badge variant="secondary" className="mb-2">
                  {currentWord.pos}
                </Badge>
              )}
              
              {currentWord.exampleSentence && (
                <div className="text-sm text-muted-foreground mt-4 p-3 bg-muted rounded-lg">
                  <span className="italic">&ldquo;{currentWord.exampleSentence}&rdquo;</span>
                </div>
              )}
            </div>

            {/* Answer Area */}
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
                  <div className="flex gap-1">
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
                    <Button variant="outline" onClick={handleDontKnow}>
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
                    {options.map((option) => (
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
                      >
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
                      >
                        I don&apos;t know
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Result Feedback */}
            {showResult && (
              <div className={cn(
                "mt-6 p-4 rounded-lg text-center",
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
                  <p className="text-sm text-muted-foreground">
                    The correct answer is: <strong>{currentWord.text}</strong>
                  </p>
                )}
              </div>
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
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {/* Session Stats */}
      <div className="flex items-center gap-6 mt-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>{Math.round(sessionStats.totalTime / 1000)}s</span>
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
    </div>
  );
}
