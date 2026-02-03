'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { evaluateDictation, saveRecording, getRecording, deleteRecording } from '@/actions/listening-actions';
import { lookupWordByText } from '@/actions/word-actions';
import { updateSentence } from '@/actions/sentence-actions';
import { recordLearningSessionDuration } from '@/actions/learning-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Play, RotateCw, Check, ArrowRight, ArrowLeft, Pause, Eye, EyeOff, RefreshCw, Keyboard, X, ChevronLeft, ChevronRight, Plus, Minus, Mic, Square, Volume2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useBreadcrumb } from '@/context/breadcrumb-context';
import { HeaderPortal } from '@/components/header-portal';
import { WordDetailSheet } from '@/app/words/word-detail-sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"

interface Props {
  sentence: any;
  materialId: string;
  nextId?: string;
  prevId?: string;
  displayIndex?: number;
}

export default function PracticeInterface({ sentence, materialId, nextId, prevId, displayIndex }: Props) {
    const router = useRouter();
    const { setItems } = useBreadcrumb();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [userText, setUserText] = useState('');
    const [feedback, setFeedback] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLooping, setIsLooping] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const startTimeRef = useRef<number>(Date.now());
    
    // Word detail sheet state
    const [selectedWord, setSelectedWord] = useState<any>(null);
    const [wordSheetOpen, setWordSheetOpen] = useState(false);
    const [loadingWord, setLoadingWord] = useState(false);
    
    // Voice recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
    const [isPlayingRecording, setIsPlayingRecording] = useState(false);
    const [isSavingRecording, setIsSavingRecording] = useState(false);
    const [hasStoredRecording, setHasStoredRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordedAudioRef = useRef<HTMLAudioElement | null>(null);
    const currentBlobRef = useRef<Blob | null>(null);

    // Load existing recording on sentence change
    useEffect(() => {
        const loadExistingRecording = async () => {
            try {
                const result = await getRecording(sentence.id);
                if (result.recording?.url) {
                    setRecordedAudioUrl(result.recording.url);
                    setHasStoredRecording(true);
                } else {
                    setRecordedAudioUrl(null);
                    setHasStoredRecording(false);
                }
            } catch (e) {
                console.error('Failed to load existing recording:', e);
            }
        };
        
        loadExistingRecording();
        setIsRecording(false);
        setIsPlayingRecording(false);
    }, [sentence.id]);

    // Voice recording functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                currentBlobRef.current = audioBlob;
                
                // Create local URL for immediate playback
                const audioUrl = URL.createObjectURL(audioBlob);
                setRecordedAudioUrl(audioUrl);
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                
                // Save to server
                setIsSavingRecording(true);
                try {
                    const formData = new FormData();
                    formData.append('audio', audioBlob, 'recording.webm');
                    
                    const result = await saveRecording(sentence.id, formData);
                    if (result.success) {
                        setHasStoredRecording(true);
                        toast.success('Recording saved');
                    } else {
                        toast.error(result.error || 'Failed to save recording');
                    }
                } catch (e) {
                    console.error('Failed to save recording:', e);
                    toast.error('Failed to save recording');
                } finally {
                    setIsSavingRecording(false);
                }
            };
            
            mediaRecorder.start();
            setIsRecording(true);
            
            // Clear previous local URL (server recording will be overwritten)
            if (recordedAudioUrl && !hasStoredRecording) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            toast.error('Failed to access microphone. Please check your permissions.');
        }
    };
    
    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };
    
    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };
    
    const playRecordedAudio = () => {
        if (!recordedAudioUrl) return;
        
        if (!recordedAudioRef.current) {
            recordedAudioRef.current = new Audio(recordedAudioUrl);
            recordedAudioRef.current.onended = () => setIsPlayingRecording(false);
        } else if (recordedAudioRef.current.src !== recordedAudioUrl) {
            recordedAudioRef.current.src = recordedAudioUrl;
        }
        
        if (isPlayingRecording) {
            recordedAudioRef.current.pause();
            recordedAudioRef.current.currentTime = 0;
            setIsPlayingRecording(false);
        } else {
            recordedAudioRef.current.play();
            setIsPlayingRecording(true);
        }
    };
    
    // Clean up local blob URLs on unmount
    useEffect(() => {
        return () => {
            // Only revoke blob URLs, not server URLs
            if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
        };
    }, [recordedAudioUrl]);

    // Handle word click to show word details
    const handleWordClick = async (wordText: string) => {
        // Clean the word: remove punctuation and convert to lowercase
        const cleanWord = wordText.replace(/[^\w']/g, '').toLowerCase();
        if (!cleanWord || cleanWord.length < 2) return;
        
        setLoadingWord(true);
        try {
            const result = await lookupWordByText(cleanWord);
            if (result.word) {
                setSelectedWord(result.word);
                setWordSheetOpen(true);
            } else if (result.error) {
                toast.error(result.error);
            } else {
                toast.info(`No definition found for "${cleanWord}"`);
            }
        } catch (e) {
            console.error('Failed to lookup word:', e);
            toast.error('Failed to lookup word');
        } finally {
            setLoadingWord(false);
        }
    };

    // Set breadcrumbs
    useEffect(() => {
        const items = [
            { title: "Materials", href: "/materials" },
            ...(sentence.material?.folder ? [{ title: sentence.material.folder.name }] : []),
            { title: sentence.material?.title || 'Material', href: `/materials/${materialId}` },
            { title: `#${displayIndex ?? (sentence.order + 1)}` }
        ];
        setItems(items);
        return () => setItems([]);
    }, [sentence, materialId, setItems, displayIndex]);

    // Reset timer on mount or sentence change
    useEffect(() => {
        startTimeRef.current = Date.now();
    }, [sentence.id]);

    // Record duration on unmount or visibility change
    useEffect(() => {
        const handleUnload = () => {
            const duration = Date.now() - startTimeRef.current;
            if (duration > 1000) { // Only record if more than 1 second
                const durationSeconds = Math.round(duration / 1000);
                recordLearningSessionDuration(durationSeconds).catch(console.error);
            }
        };
        
        window.addEventListener('beforeunload', handleUnload);
        
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleUnload();
                // Reset start time so we don't double count if user comes back
                startTimeRef.current = Date.now();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            handleUnload();
        };
    }, []);

    // Local sentence state for immediate updates
    const [currentSentence, setCurrentSentence] = useState(sentence);
    
    useEffect(() => {
        setCurrentSentence(sentence);
    }, [sentence]);

    const handlePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                const start = Number.isFinite(currentSentence.startTime) ? currentSentence.startTime : 0;
                const end = Number.isFinite(currentSentence.endTime) ? currentSentence.endTime : 0;
                
                // Always start from beginning of sentence if stopped
                if (audioRef.current.currentTime < start || (end > 0 && audioRef.current.currentTime >= end)) {
                    audioRef.current.currentTime = start;
                }
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    const handleReplay = () => {
        if (audioRef.current) {
            const start = Number.isFinite(currentSentence.startTime) ? currentSentence.startTime : 0;
            audioRef.current.currentTime = start;
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    const handleCheck = async () => {
        if (!userText.trim()) {
            toast.error("Please type something first!");
            return;
        }
        
        // Calculate duration in seconds
        const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
        
        const result = await evaluateDictation(currentSentence.id, userText, durationSeconds);
        
        // Reset timer for next attempt
        startTimeRef.current = Date.now();

        if (result.error) {
            toast.error(result.error);
        } else {
            setFeedback(result);
            if (result.score === 100) {
                toast.success("Perfect match!");
            } else {
                toast.info(`Score: ${result.score}%`);
            }
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            // Add a small buffer to end time to prevent cutting off too early
            // Ensure we have valid start/end times before enforcing loop/stop
            const startTime = Number.isFinite(currentSentence.startTime) ? currentSentence.startTime : 0;
            const endTime = Number.isFinite(currentSentence.endTime) ? currentSentence.endTime : 0;

            if (endTime > 0 && audio.currentTime >= endTime) {
                if (isLooping) {
                    audio.currentTime = startTime;
                    audio.play();
                } else {
                    audio.pause();
                    setIsPlaying(false);
                    audio.currentTime = startTime; // Reset to start
                }
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
    }, [currentSentence, isLooping]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Tab: Replay
            if (e.key === 'Tab') {
                e.preventDefault();
                handleReplay();
                return;
            }

            // Enter: Submit (if not shift+enter)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCheck();
                return;
            }

            // Shift + Arrows for navigation
            if (e.shiftKey && e.key === 'ArrowRight') {
                e.preventDefault();
                if (nextId) router.push(`/study/sentences/${nextId}`);
                return;
            }
            if (e.shiftKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                if (prevId) router.push(`/study/sentences/${prevId}`);
                return;
            }

            // Ctrl+Space: Play/Pause
            if (e.ctrlKey && e.key === ' ') {
                e.preventDefault();
                handlePlay();
                return;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, nextId, prevId, userText, sentence.id]); 

    // Clear state and auto-play on navigation
    useEffect(() => {
        setUserText('');
        setFeedback(null);
        setShowTranscript(false);
        
        if (audioRef.current) {
            const start = Number.isFinite(sentence.startTime) ? sentence.startTime : 0;
            if (Number.isFinite(start)) {
                audioRef.current.currentTime = start;
            }
            
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => setIsPlaying(true))
                    .catch((err) => {
                        console.error("Auto-play failed:", err);
                        setIsPlaying(false);
                    });
            }
        }
    }, [sentence.id, sentence.startTime]);

    const handleTimeAdjustment = async (type: 'start' | 'end', change: number) => {
        const newSentence = { ...currentSentence };
        if (type === 'start') {
            newSentence.startTime = Math.max(0, (newSentence.startTime || 0) + change);
            // Ensure start time doesn't exceed end time
            if (newSentence.endTime && newSentence.startTime >= newSentence.endTime) {
                newSentence.startTime = newSentence.endTime - 0.1;
            }
        } else {
            newSentence.endTime = Math.max((newSentence.startTime || 0) + 0.1, (newSentence.endTime || 0) + change);
        }
        
        setCurrentSentence(newSentence);
        
        try {
            const result = await updateSentence(newSentence.id, {
                content: newSentence.content,
                startTime: newSentence.startTime,
                endTime: newSentence.endTime
            });
            
            if (result.error) {
                toast.error(result.error);
            }
        } catch (e) {
            console.error(e);
            toast.error("Failed to update time");
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto p-4 md:p-6 min-h-[calc(100vh-4rem)] flex flex-col">


            <div className="flex-1 w-full flex items-center justify-center gap-4">
                {/* Left Navigation Button */}
                <div className="hidden md:block">
                    {prevId ? (
                        <Button variant="ghost" size="icon" asChild title="Previous Sentence" className="h-12 w-12 rounded-full">
                            <Link href={`/study/sentences/${prevId}`}>
                                <ChevronLeft className="h-8 w-8" />
                            </Link>
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon" disabled className="h-12 w-12 rounded-full opacity-50">
                            <ChevronLeft className="h-8 w-8" />
                        </Button>
                    )}
                </div>

                {/* Main Practice Area */}
                <div className="space-y-6 w-full max-w-3xl">
                    <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm w-full">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <CardTitle className="text-xl">Sentence #{displayIndex ?? (currentSentence.order + 1)}</CardTitle>
                                    <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-2 py-1">
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-4 w-4 hover:bg-background/50"
                                                onClick={() => handleTimeAdjustment('start', -0.1)}
                                                title="Start time -0.1s"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="font-mono text-xs w-12 text-center">{formatTimeDetail(currentSentence.startTime)}</span>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-4 w-4 hover:bg-background/50"
                                                onClick={() => handleTimeAdjustment('start', 0.1)}
                                                title="Start time +0.1s"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <span className="text-muted-foreground text-xs">-</span>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-4 w-4 hover:bg-background/50"
                                                onClick={() => handleTimeAdjustment('end', -0.1)}
                                                title="End time -0.1s"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="font-mono text-xs w-12 text-center">{formatTimeDetail(currentSentence.endTime)}</span>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-4 w-4 hover:bg-background/50"
                                                onClick={() => handleTimeAdjustment('end', 0.1)}
                                                title="End time +0.1s"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowTranscript(!showTranscript)}
                                    className={showTranscript ? "text-primary" : "text-muted-foreground"}
                                >
                                    {showTranscript ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                                    {showTranscript ? "Hide Text" : "Show Text"}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Audio Controls */}
                            <div className="flex items-center justify-center gap-4 py-4 bg-muted/30 rounded-xl">
                                <audio 
                                    ref={audioRef} 
                                    src={`/api/materials/${materialId}/stream`} 
                                    preload="auto"
                                />
                                
                                <Button 
                                    variant="outline" 
                                    size="icon"
                                    onClick={() => setIsLooping(!isLooping)}
                                    className={`rounded-full w-10 h-10 ${isLooping ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
                                    title="Loop (Toggle)"
                                >
                                    <RotateCw className={`h-4 w-4 ${isLooping ? 'animate-spin-slow' : ''}`} />
                                </Button>

                                <Button 
                                    onClick={handlePlay} 
                                    size="lg"
                                    className="rounded-full w-16 h-16 shadow-md hover:scale-105 transition-transform"
                                >
                                    {isPlaying ? (
                                        <Pause className="h-8 w-8 fill-current" />
                                    ) : (
                                        <Play className="h-8 w-8 fill-current ml-1" />
                                    )}
                                </Button>

                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleReplay}
                                    className="rounded-full w-10 h-10"
                                    title="Replay (Tab)"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                            
                            {/* Voice Recording Section */}
                            <div className="flex items-center justify-center gap-3 py-3 px-4 bg-muted/20 rounded-lg border border-dashed">
                                <span className="text-sm text-muted-foreground">Speaking Practice:</span>
                                <Button
                                    variant={isRecording ? "destructive" : "outline"}
                                    size="sm"
                                    onClick={toggleRecording}
                                    disabled={isSavingRecording}
                                    className={`gap-2 ${isRecording ? 'animate-pulse' : ''}`}
                                    title={isRecording ? "Stop recording" : "Start recording"}
                                >
                                    {isRecording ? (
                                        <>
                                            <Square className="h-4 w-4 fill-current" />
                                            Stop
                                        </>
                                    ) : (
                                        <>
                                            <Mic className="h-4 w-4" />
                                            {hasStoredRecording ? 'Re-record' : 'Record'}
                                        </>
                                    )}
                                </Button>
                                
                                {recordedAudioUrl && !isRecording && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={playRecordedAudio}
                                        disabled={isSavingRecording}
                                        className="gap-2"
                                        title="Play your recording"
                                    >
                                        {isPlayingRecording ? (
                                            <>
                                                <Pause className="h-4 w-4" />
                                                Pause
                                            </>
                                        ) : (
                                            <>
                                                <Volume2 className="h-4 w-4" />
                                                Play Recording
                                            </>
                                        )}
                                    </Button>
                                )}
                                
                                {isRecording && (
                                    <span className="text-sm text-destructive font-medium flex items-center gap-2">
                                        <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                                        Recording...
                                    </span>
                                )}
                                
                                {isSavingRecording && (
                                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        Saving...
                                    </span>
                                )}
                                
                                {hasStoredRecording && !isRecording && !isSavingRecording && (
                                    <Badge variant="secondary" className="text-xs">
                                        <Check className="h-3 w-3 mr-1" />
                                        Saved
                                    </Badge>
                                )}
                            </div>

                            {/* Transcript Viewer (Collapsible) */}
                            {showTranscript && (
                                <div className="p-4 bg-muted/50 rounded-lg border text-lg leading-relaxed animate-in fade-in slide-in-from-top-2">
                                    {sentence.content}
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="relative w-full">
                                    <Textarea 
                                        placeholder="Type what you hear..." 
                                        value={userText}
                                        onChange={(e) => {
                                            setUserText(e.target.value);
                                            // Clear feedback when user clears input
                                            if (!e.target.value.trim() && feedback) {
                                                setFeedback(null);
                                            }
                                        }}
                                        rows={4}
                                        className="text-lg p-4 pr-12 shadow-sm focus-visible:ring-offset-0 min-h-[120px] resize-none w-full whitespace-pre-wrap break-words"
                                        spellCheck={false}
                                        autoFocus
                                    />
                                    
                                    {/* Shortcuts Button */}
                                    <div className="absolute top-2 right-2">
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Keyboard Shortcuts">
                                                    <Keyboard className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Keyboard Shortcuts</DialogTitle>
                                                    <DialogDescription>
                                                        Use these keys to control playback and navigation.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="grid gap-4 py-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium">Play / Pause</span>
                                                        <kbd className="px-2 py-1 bg-muted border rounded text-xs shadow-sm font-mono">Ctrl + Space</kbd>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium">Replay</span>
                                                        <kbd className="px-2 py-1 bg-muted border rounded text-xs shadow-sm font-mono">Tab</kbd>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium">Check Answer</span>
                                                        <kbd className="px-2 py-1 bg-muted border rounded text-xs shadow-sm font-mono">Enter</kbd>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium">Next Sentence</span>
                                                        <kbd className="px-2 py-1 bg-muted border rounded text-xs shadow-sm font-mono">Shift + →</kbd>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium">Prev Sentence</span>
                                                        <kbd className="px-2 py-1 bg-muted border rounded text-xs shadow-sm font-mono">Shift + ←</kbd>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>

                                    <div className="absolute bottom-3 right-3 text-xs text-muted-foreground pointer-events-none">
                                        Press Enter to submit
                                    </div>
                                </div>
                                
                                <Button 
                                    onClick={handleCheck} 
                                    className="w-full h-12 text-lg font-medium shadow-sm" 
                                    disabled={!userText}
                                >
                                    Check Answer
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Feedback Area */}
                    {feedback && (
                        <Alert className={`shadow-md animate-in fade-in zoom-in-95 w-full block ${feedback.score === 100 ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}>
                            <div className="flex flex-col w-full gap-4">
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                        {feedback.score === 100 ? (
                                            <Check className="h-5 w-5 text-green-600" />
                                        ) : (
                                            <X className="h-5 w-5 text-orange-600" />
                                        )}
                                        <AlertTitle className={`text-lg font-semibold ${feedback.score === 100 ? "text-green-700" : "text-orange-700"}`}>
                                            {feedback.score === 100 ? "Correct Answer" : "Incorrect Answer"}
                                        </AlertTitle>
                                    </div>
                                    <div className={`text-lg font-bold ${feedback.score === 100 ? "text-green-700" : "text-orange-700"}`}>
                                        Score: {feedback.score}%
                                    </div>
                                </div>
                                
                                <div className="w-full">
                                    <div className="text-lg leading-relaxed font-mono">
                                        {renderDiff(feedback.diff, handleWordClick, loadingWord)}
                                    </div>
                                    {feedback.score < 100 && (
                                        <div className="mt-4 pt-4 border-t border-orange-200/50">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Correct Answer</p>
                                            <div className="text-lg text-foreground font-medium break-words">
                                                {renderClickableText(feedback.target, handleWordClick, loadingWord)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Alert>
                    )}
                </div>

                {/* Right Navigation Button */}
                <div className="hidden md:block">
                    {nextId ? (
                        <Button variant="ghost" size="icon" asChild title="Next Sentence" className="h-12 w-12 rounded-full">
                            <Link href={`/study/sentences/${nextId}`}>
                                <ChevronRight className="h-8 w-8" />
                            </Link>
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon" disabled className="h-12 w-12 rounded-full opacity-50">
                            <ChevronRight className="h-8 w-8" />
                        </Button>
                    )}
                </div>
            </div>
            
            {/* Mobile Navigation (Bottom) */}
            <div className="flex md:hidden items-center justify-between mt-4 gap-4">
                {prevId ? (
                    <Button variant="outline" className="flex-1" asChild>
                        <Link href={`/study/sentences/${prevId}`}>
                            <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                        </Link>
                    </Button>
                ) : (
                    <Button variant="outline" className="flex-1" disabled>
                        <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                    </Button>
                )}
                
                {nextId ? (
                    <Button variant="outline" className="flex-1" asChild>
                        <Link href={`/study/sentences/${nextId}`}>
                            Next <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                ) : (
                    <Button variant="outline" className="flex-1" disabled>
                        Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                )}
            </div>
            
            {/* Word Detail Sheet */}
            <WordDetailSheet 
                word={selectedWord} 
                open={wordSheetOpen} 
                onOpenChange={(open) => {
                    setWordSheetOpen(open);
                    if (!open) {
                        setSelectedWord(null);
                    }
                }} 
            />
        </div>
    );
}

function renderDiff(diff: any[], onWordClick: (word: string) => void, isLoading: boolean) {
    // Helper function to make text clickable word by word
    const makeClickable = (text: string, baseKey: string | number, className: string) => {
        // Split by words while preserving spaces and punctuation
        const parts = text.split(/(\s+)/);
        return parts.map((part, idx) => {
            // Check if it's a word (not just whitespace or punctuation)
            const isWord = /[a-zA-Z]{2,}/.test(part);
            if (isWord) {
                return (
                    <span 
                        key={`${baseKey}-${idx}`}
                        className={`${className} cursor-pointer hover:underline hover:decoration-2 transition-all ${isLoading ? 'opacity-50' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isLoading) onWordClick(part);
                        }}
                        title="Click to see word details"
                    >
                        {part}
                    </span>
                );
            }
            return <span key={`${baseKey}-${idx}`} className={className}>{part}</span>;
        });
    };

    // Process diff to show inline corrections like: "It's [greate -> great] to see..."
    const result = [];
    let i = 0;
    
    while (i < diff.length) {
        const current = diff[i];
        const next = diff[i + 1];
        
        // Check for substitution pattern: removed followed immediately by added
        if (current.removed && next && next.added) {
            result.push(
                <span key={i} className="mx-1">
                    <span className="bg-red-100 text-red-700 line-through decoration-red-400/50 px-1 rounded text-base opacity-70">
                        {makeClickable(next.value, `${i}-wrong`, '')}
                    </span>
                    <span className="mx-0.5 text-muted-foreground text-sm">→</span>
                    <span className="bg-green-100 text-green-700 px-1 rounded font-medium border border-green-200">
                        {makeClickable(current.value, `${i}-correct`, '')}
                    </span>
                </span>
            );
            i += 2; // Skip next element since we handled it
        } 
        // Handle added only (Extra word in user input - Incorrect)
        else if (current.added) {
             result.push(
                <span key={i} className="bg-red-100 text-red-700 line-through decoration-red-400/50 px-1 rounded mx-0.5">
                    {makeClickable(current.value, i, '')}
                </span>
            );
            i++;
        }
        // Handle removed only (Missing word in user input - Correct answer)
        else if (current.removed) {
            result.push(
                <span key={i} className="bg-green-100 text-green-700 px-1 rounded font-medium border border-green-200 mx-0.5">
                    {makeClickable(current.value, i, '')}
                </span>
            );
            i++;
        }
        // Unchanged text
        else {
            result.push(
                <span key={i}>
                    {makeClickable(current.value, i, 'text-foreground/80')}
                </span>
            );
            i++;
        }
    }
    
    return result;
}

// Helper function to render text with clickable words
function renderClickableText(text: string, onWordClick: (word: string) => void, isLoading: boolean) {
    // Split by words while preserving spaces and punctuation
    const parts = text.split(/(\s+)/);
    return parts.map((part, idx) => {
        // Check if it's a word (not just whitespace or punctuation)
        const isWord = /[a-zA-Z]{2,}/.test(part);
        if (isWord) {
            return (
                <span 
                    key={idx}
                    className={`cursor-pointer hover:underline hover:decoration-2 hover:text-primary transition-all ${isLoading ? 'opacity-50' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!isLoading) onWordClick(part);
                    }}
                    title="Click to see word details"
                >
                    {part}
                </span>
            );
        }
        return <span key={idx}>{part}</span>;
    });
}

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeDetail(seconds: number) {
    if (!Number.isFinite(seconds)) return "0:00.0";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
}
