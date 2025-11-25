'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { evaluateDictation } from '@/actions/listening-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Play, RotateCw, Check, ArrowRight, ArrowLeft, Pause, Eye, EyeOff, RefreshCw, Keyboard, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useBreadcrumb } from '@/context/breadcrumb-context';
import { HeaderPortal } from '@/components/header-portal';
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
}

export default function PracticeInterface({ sentence, materialId, nextId, prevId }: Props) {
    const router = useRouter();
    const { setItems } = useBreadcrumb();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [userText, setUserText] = useState('');
    const [feedback, setFeedback] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLooping, setIsLooping] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const startTimeRef = useRef<number>(Date.now());

    // Set breadcrumbs
    useEffect(() => {
        const items = [
            { title: "Materials", href: "/materials" },
            ...(sentence.material?.folder ? [{ title: sentence.material.folder.name }] : []),
            { title: sentence.material?.title || 'Material', href: `/materials/${materialId}` },
            { title: `#${sentence.order + 1}` }
        ];
        setItems(items);
        return () => setItems([]);
    }, [sentence, materialId, setItems]);

    // Reset timer on mount or sentence change
    useEffect(() => {
        startTimeRef.current = Date.now();
    }, [sentence.id]);

    const handlePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                // Always start from beginning of sentence if stopped
                if (audioRef.current.currentTime < sentence.startTime || audioRef.current.currentTime >= sentence.endTime) {
                    audioRef.current.currentTime = sentence.startTime;
                }
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    const handleReplay = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = sentence.startTime;
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
        
        const result = await evaluateDictation(sentence.id, userText, durationSeconds);
        
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
            if (audio.currentTime >= sentence.endTime) {
                if (isLooping) {
                    audio.currentTime = sentence.startTime;
                    audio.play();
                } else {
                    audio.pause();
                    setIsPlaying(false);
                    audio.currentTime = sentence.startTime; // Reset to start
                }
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
    }, [sentence, isLooping]);

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
                if (nextId) router.push(`/listening/${nextId}`);
                return;
            }
            if (e.shiftKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                if (prevId) router.push(`/listening/${prevId}`);
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
            audioRef.current.currentTime = sentence.startTime;
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

    return (
        <div className="w-full max-w-3xl mx-auto p-4 md:p-6 min-h-[calc(100vh-4rem)] flex flex-col">
            <HeaderPortal>
                <div className="flex items-center gap-2">
                    {prevId ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/listening/${prevId}`}>
                                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                            </Link>
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" disabled>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                        </Button>
                    )}

                    {nextId ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/listening/${nextId}`}>
                                Next <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" disabled>
                            Next <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    )}
                </div>
            </HeaderPortal>

            <div className="flex-1 w-full">
                {/* Main Practice Area */}
                <div className="space-y-6 w-full">
                    <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm w-full">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <CardTitle className="text-xl">Sentence #{sentence.order + 1}</CardTitle>
                                    <Badge variant="secondary" className="font-mono text-xs">
                                        {formatTime(sentence.startTime)} - {formatTime(sentence.endTime)}
                                    </Badge>
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
                                        onChange={(e) => setUserText(e.target.value)}
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
                                        {renderDiff(feedback.diff)}
                                    </div>
                                    {feedback.score < 100 && (
                                        <div className="mt-4 pt-4 border-t border-orange-200/50">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Correct Answer</p>
                                            <div className="text-lg text-foreground font-medium break-words">
                                                {feedback.target}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Alert>
                    )}
                </div>
            </div>
        </div>
    );
}

function renderDiff(diff: any[]) {
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
                        {next.value}
                    </span>
                    <span className="mx-0.5 text-muted-foreground text-sm">→</span>
                    <span className="bg-green-100 text-green-700 px-1 rounded font-medium border border-green-200">
                        {current.value}
                    </span>
                </span>
            );
            i += 2; // Skip next element since we handled it
        } 
        // Handle added only (Extra word in user input - Incorrect)
        else if (current.added) {
             result.push(
                <span key={i} className="bg-red-100 text-red-700 line-through decoration-red-400/50 px-1 rounded mx-0.5">
                    {current.value}
                </span>
            );
            i++;
        }
        // Handle removed only (Missing word in user input - Correct answer)
        else if (current.removed) {
            result.push(
                <span key={i} className="bg-green-100 text-green-700 px-1 rounded font-medium border border-green-200 mx-0.5">
                    {current.value}
                </span>
            );
            i++;
        }
        // Unchanged text
        else {
            result.push(
                <span key={i} className="text-foreground/80">
                    {current.value}
                </span>
            );
            i++;
        }
    }
    
    return result;
}

function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
