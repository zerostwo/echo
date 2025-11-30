"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEffect, useState, useRef } from "react"
import { getWordContext } from "@/actions/word-actions"
import { Loader2, Volume2, Play, Pause, ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { parsePos, parseExchange, parseTags } from "@/lib/vocab-utils"
import { useUserSettings } from "@/components/user-settings-provider"

interface WordDetailSheetProps {
    word: any
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function WordDetailSheet({ word, open, onOpenChange }: WordDetailSheetProps) {
    const { pronunciationAccent } = useUserSettings();
    const [occurrences, setOccurrences] = useState<any[]>([]);
    const [loadingCtx, setLoadingCtx] = useState(false);
    const [playingSentenceId, setPlayingSentenceId] = useState<string | null>(null);
    const [isPlayingWord, setIsPlayingWord] = useState(false);
    
    const sentenceAudioRef = useRef<HTMLAudioElement>(null);
    const youdaoAudioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (open && word?.id) {
            setLoadingCtx(true);
            getWordContext(word.id)
                .then(res => {
                    if (res.occurrences) {
                        setOccurrences(res.occurrences);
                    }
                })
                .finally(() => setLoadingCtx(false));
        } else {
            setOccurrences([]);
            setPlayingSentenceId(null);
            setIsPlayingWord(false);
        }
    }, [open, word?.id]);

    // Handle sentence audio playback
    const handlePlaySentence = (sentence: any) => {
        if (!sentenceAudioRef.current) return;

        const audio = sentenceAudioRef.current;
        
        // Stop any current playback
        audio.pause();
        
        if (playingSentenceId === sentence.id) {
            setPlayingSentenceId(null);
            return;
        }

        // Supabase returns snake_case column names from the database
        const materialId = sentence.material_id || sentence.materialId;
        const startTime = sentence.start_time ?? sentence.startTime ?? 0;
        const endTime = sentence.end_time ?? sentence.endTime ?? 0;

        const src = `/api/materials/${materialId}/stream`;
        const fullSrc = window.location.origin + src;
        
        const playAudio = () => {
            audio.currentTime = startTime;
            audio.play().catch(console.error);
            setPlayingSentenceId(sentence.id);
        };

        if (audio.src !== fullSrc) {
             audio.src = src;
             // Wait for metadata to load before seeking
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
                audio.onloadedmetadata = null; // Cleanup
            }
        };
        
        audio.addEventListener('timeupdate', handleTimeUpdate);
        
        audio.onpause = () => {
             // Only clear if we are actually paused/stopped, not just buffering
             if (!audio.seeking && (audio.currentTime >= endTime || audio.ended || audio.paused)) {
                 setPlayingSentenceId(null);
                 audio.removeEventListener('timeupdate', handleTimeUpdate);
                 audio.onloadedmetadata = null;
             }
        };
    };

    // Handle word pronunciation playback using Youdao API
    const handlePlayWord = () => {
        if (!youdaoAudioRef.current || !word?.text) return;

        const audio = youdaoAudioRef.current;
        
        if (isPlayingWord) {
            audio.pause();
            setIsPlayingWord(false);
            return;
        }

        // type=1 for UK accent, type=2 for US accent
        const accentType = pronunciationAccent === 'uk' ? 1 : 2;
        const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.text)}&type=${accentType}`;
        
        audio.src = audioUrl;
        audio.currentTime = 0;
        audio.play()
            .then(() => setIsPlayingWord(true))
            .catch(console.error);
        
        audio.onended = () => setIsPlayingWord(false);
        audio.onerror = () => setIsPlayingWord(false);
    };

    if (!word) return null;

    const posList = parsePos(word.pos);
    const exchangeList = parseExchange(word.exchange);
    const tagList = parseTags(word.tag);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl w-full p-0 [&>button]:hidden">
                <div className="flex flex-col h-full">
                    <div className="p-6 pb-2 flex-shrink-0">
                        <SheetHeader className="p-0 space-y-2">
                            <div className="flex items-start justify-between">
                                <SheetTitle className="text-3xl font-bold flex items-center gap-3">
                                    {word.text}
                                    {word.phonetic && <span className="text-lg font-normal text-muted-foreground font-mono">[{word.phonetic}]</span>}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={handlePlayWord}
                                        className={`h-8 w-8 ${isPlayingWord ? "text-primary animate-pulse" : "text-muted-foreground"}`}
                                        title="Play Pronunciation"
                                    >
                                        {isPlayingWord ? <Pause className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                                    </Button>
                                </SheetTitle>
                                <SheetClose asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground -mr-2 -mt-1">
                                        <X className="h-4 w-4" />
                                        <span className="sr-only">Close</span>
                                    </Button>
                                </SheetClose>
                            </div>
                            <SheetDescription className="flex flex-wrap gap-2">
                                {posList.length > 0 ? (
                                    posList.map((pos, idx) => (
                                        <Badge key={idx} variant="outline" className="font-normal">
                                            <span className="font-semibold mr-1">{pos.label}</span>
                                            {pos.percentage && <span className="text-muted-foreground opacity-70">{pos.percentage}</span>}
                                        </Badge>
                                    ))
                                ) : (
                                    word.pos && <Badge variant="outline">{word.pos}</Badge>
                                )}
                                {tagList.map((tag, idx) => (
                                    <Badge key={idx} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                                        {tag.label}
                                    </Badge>
                                ))}
                            </SheetDescription>
                        </SheetHeader>
                    </div>

                    <ScrollArea className="flex-1 px-6 h-[1px]">
                        <div className="space-y-8 pb-10 pl-1 pt-2">
                            {/* Definition Section */}
                            {word.definition && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Definition</h3>
                                    <div className="pl-4">
                                        <p className="text-md leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200">{word.definition}</p>
                                    </div>
                                </div>
                            )}

                            {/* Translation Section */}
                            {word.translation && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Translation</h3>
                                    <div className="pl-4">
                                        <p className="text-lg leading-relaxed whitespace-pre-wrap">{word.translation}</p>
                                    </div>
                                </div>
                            )}

                            {/* Word Forms Section */}
                            {exchangeList.length > 0 && (
                                <div className="space-y-3">
                                     <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Word Forms</h3>
                                     <div className="pl-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                                            {exchangeList.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-baseline border-b border-dotted border-muted-foreground/20 pb-1">
                                                    <span className="text-muted-foreground text-xs uppercase tracking-wide">{item.label}</span>
                                                    <span className="font-medium font-mono text-sm">{item.word}</span>
                                                </div>
                                            ))}
                                        </div>
                                     </div>
                                </div>
                            )}
                            
                            {/* Stats Section */}
                            {(word.collins || word.bnc || word.frq || word.oxford) && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Statistics</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pl-4">
                                        {word.collins && (
                                            <div className="bg-muted/30 p-3 rounded-lg border text-center">
                                                <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Collins</div>
                                                <div className="flex justify-center text-yellow-500 text-sm">
                                                    {"★".repeat(Number(word.collins))}
                                                    <span className="text-muted-foreground/20">{"★".repeat(5 - Number(word.collins))}</span>
                                                </div>
                                            </div>
                                        )}
                                        {word.bnc && (
                                            <div className="bg-muted/30 p-3 rounded-lg border text-center">
                                                <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">BNC Rank</div>
                                                <div className="font-mono font-semibold">{word.bnc}</div>
                                            </div>
                                        )}
                                        {word.frq && (
                                            <div className="bg-muted/30 p-3 rounded-lg border text-center">
                                                <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Frequency</div>
                                                <div className="font-mono font-semibold">{word.frq}</div>
                                            </div>
                                        )}
                                        {word.oxford === 1 && (
                                            <div className="bg-muted/30 p-3 rounded-lg border text-center flex flex-col justify-center items-center bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800">
                                                <div className="text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">Oxford 3000</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Context Sentences */}
                            <div className="space-y-3 border-t pt-6">
                                 <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Context Sentences</h3>
                                 <div className="pl-4">
                                     {loadingCtx ? (
                                         <div className="flex items-center text-sm text-muted-foreground py-4">
                                             <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                             Loading examples...
                                         </div>
                                     ) : occurrences.length > 0 ? (
                                         <ul className="space-y-4">
                                             {occurrences.map(occ => (
                                                 <li key={occ.id} 
                                                     className={`relative group rounded-lg border transition-all duration-200 ${playingSentenceId === occ.sentence.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'bg-card hover:bg-muted/50'}`}
                                                 >
                                                     <div className="p-4 cursor-pointer" onClick={() => handlePlaySentence(occ.sentence)}>
                                                         <div className="flex gap-3">
                                                             <div className="flex-shrink-0 mt-1">
                                                                 <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${playingSentenceId === occ.sentence.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}`}>
                                                                     {playingSentenceId === occ.sentence.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                                                                 </div>
                                                             </div>
                                                             <div className="flex-1 min-w-0">
                                                                 <p className="leading-relaxed text-sm" dangerouslySetInnerHTML={{ 
                                                                     __html: occ.sentence.content.replace(
                                                                         new RegExp(`\\b(${word.text})\\b`, 'gi'), 
                                                                         '<span class="font-bold text-primary bg-primary/10 rounded px-0.5">$1</span>'
                                                                     ) 
                                                                 }} />
                                                             </div>
                                                         </div>
                                                     </div>
                                                     <div className="px-4 pb-3 pt-0 flex justify-end">
                                                         <Link 
                                                             href={`/materials/${occ.sentence.material.id}`}
                                                             className="inline-flex items-center text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
                                                             onClick={(e) => e.stopPropagation()}
                                                         >
                                                             <span>{occ.sentence.material.title}</span>
                                                             <ExternalLink className="w-3 h-3 ml-1" />
                                                         </Link>
                                                     </div>
                                                 </li>
                                             ))}
                                         </ul>
                                     ) : (
                                         <div className="text-sm text-muted-foreground italic py-4 text-center bg-muted/20 rounded-lg">
                                             No context sentences found for this word.
                                         </div>
                                     )}
                                 </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </SheetContent>
            
            {/* Hidden Audio Elements */}
            <audio ref={sentenceAudioRef} className="hidden" />
            <audio ref={youdaoAudioRef} className="hidden" />
        </Sheet>
    )
}
