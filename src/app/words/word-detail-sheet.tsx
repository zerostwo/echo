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
import { getWordContext, getWordRelations, addWordRelation, removeWordRelation, updateWordDetails } from "@/actions/word-actions"
import { Loader2, Volume2, Play, Pause, ExternalLink, X, Plus, Pencil, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { parsePos, parseExchange, parseTags, getAllWordForms, createWordFormsRegex, TRANS_PREFIX_MAP } from "@/lib/vocab-utils"
import { useUserSettings } from "@/components/user-settings-provider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getMaterialFileProxyUrl, getMaterialFileViewUrl } from "@/lib/appwrite-urls"

const FormattedText = ({ text }: { text: string }) => {
    if (!text) return null;
    
    const lines = text.split('\n');
    
    return (
        <div className="space-y-1">
            {lines.map((line, i) => {
                // Match prefix like "n. ", "vt. ", "a. "
                // The regex should match the start of the line
                const match = line.match(/^([a-z]+\.([ \t]*(&|or)[ \t]*[a-z]+\.)*)\s*(.*)/i);
                
                if (match) {
                    const prefix = match[1];
                    const content = match[4]; // The rest of the line
                    
                    const mappedPrefix = prefix.replace(/[a-z]+\./gi, (m) => {
                        const lower = m.toLowerCase();
                        return TRANS_PREFIX_MAP[lower] || m;
                    });

                    return (
                        <div key={i} className="flex gap-3">
                            <div className="w-12 text-right font-serif italic text-muted-foreground shrink-0">{mappedPrefix}</div>
                            <div className="flex-1">{content}</div>
                        </div>
                    );
                }
                
                return <div key={i} className="leading-relaxed pl-[3.75rem]">{line}</div>;
            })}
        </div>
    );
};

interface WordDetailSheetProps {
    word: any
    open: boolean
    onOpenChange: (open: boolean) => void
    dictionaryId?: string
    onWordUpdate?: (updatedWord: any) => void
}

export function WordDetailSheet({ word, open, onOpenChange, dictionaryId, onWordUpdate }: WordDetailSheetProps) {
    const { pronunciationAccent } = useUserSettings();
    const [displayWord, setDisplayWord] = useState(word);
    const [occurrences, setOccurrences] = useState<any[]>([]);
    const [loadingCtx, setLoadingCtx] = useState(false);
    const [playingSentenceId, setPlayingSentenceId] = useState<string | null>(null);
    const [isPlayingWord, setIsPlayingWord] = useState(false);
    
    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editDefinition, setEditDefinition] = useState("");
    const [editTranslation, setEditTranslation] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    
    // Relations state
    const [relations, setRelations] = useState<any[]>([]);
    const [loadingRelations, setLoadingRelations] = useState(false);
    const [newRelationText, setNewRelationText] = useState("");
    const [newRelationType, setNewRelationType] = useState("SYNONYM");
    const [isAddingRelation, setIsAddingRelation] = useState(false);
    
    const sentenceAudioRef = useRef<HTMLAudioElement>(null);
    const youdaoAudioRef = useRef<HTMLAudioElement>(null);

    // Sync displayWord with prop word when it changes
    useEffect(() => {
        setDisplayWord(word);
    }, [word]);

    useEffect(() => {
        if (open && displayWord?.id) {
            setLoadingCtx(true);
            getWordContext(displayWord.id)
                .then(res => {
                    if (res.occurrences) {
                        // Deduplicate sentences - keep only the first occurrence for each sentence
                        const uniqueSentences = new Map();
                        res.occurrences.forEach((occ: any) => {
                            if (!uniqueSentences.has(occ.sentence.id)) {
                                uniqueSentences.set(occ.sentence.id, occ);
                            }
                        });
                        setOccurrences(Array.from(uniqueSentences.values()));
                    }
                })
                .finally(() => setLoadingCtx(false));
                
            setLoadingRelations(true);
            getWordRelations(displayWord.id)
                .then(res => {
                    if (res.relations) {
                        setRelations(res.relations);
                    }
                })
                .finally(() => setLoadingRelations(false));
            
            // Initialize edit state
            setEditDefinition(displayWord.definition || "");
            setEditTranslation(displayWord.translation || "");
            setIsEditing(false);
        } else {
            setOccurrences([]);
            setRelations([]);
            setPlayingSentenceId(null);
            setIsPlayingWord(false);
            setIsEditing(false);
        }
    }, [open, displayWord?.id, displayWord?.definition, displayWord?.translation]);

    const handleSave = async () => {
        if (!displayWord?.id) return;
        
        setIsSaving(true);
        try {
            const result = await updateWordDetails(displayWord.id, {
                definition: editDefinition,
                translation: editTranslation
            });
            
            if (result.success) {
                toast.success("Word details updated");
                setIsEditing(false);
                
                // Update local display state immediately (WYSIWYG)
                const updatedWord = { 
                    ...displayWord, 
                    definition: editDefinition, 
                    translation: editTranslation 
                };
                setDisplayWord(updatedWord);
                
                // Notify parent
                if (onWordUpdate) {
                    onWordUpdate(updatedWord);
                }
            } else {
                toast.error("Failed to update word details");
            }
        } catch (e) {
            console.error(e);
            toast.error("An error occurred");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddRelation = async () => {
        if (!newRelationText.trim() || !displayWord?.id) return;
        
        setIsAddingRelation(true);
        try {
            const result = await addWordRelation(displayWord.id, newRelationText.trim(), newRelationType, dictionaryId);
            if (result.success) {
                setNewRelationText("");
                // Refresh relations
                const res = await getWordRelations(displayWord.id);
                if (res.relations) setRelations(res.relations);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsAddingRelation(false);
        }
    };

    const handleRemoveRelation = async (id: string) => {
        try {
            await removeWordRelation(id);
            setRelations(prev => prev.filter(r => r.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    // Handle sentence audio playback
    const handlePlaySentence = (sentence: any) => {
        if (!sentenceAudioRef.current) return;

        const audio = sentenceAudioRef.current;
        const sentenceId = sentence?.id ?? sentence?.$id ?? sentence?.sentence_id;
        
        // Stop any current playback
        audio.pause();
        
        if (playingSentenceId === sentence.id) {
            setPlayingSentenceId(null);
            return;
        }

        // Handle both snake_case (Appwrite) and camelCase field names
        const startTime = sentence.start_time ?? sentence.startTime ?? 0;
        const endTime = sentence.end_time ?? sentence.endTime ?? 0;

        const filePath = sentence.material?.filePath || sentence.material?.file_path || (sentence as any).material_file_path;
        const materialId = sentence.material?.id || sentence.material_id;
        const src = getMaterialFileProxyUrl(materialId) || getMaterialFileViewUrl(filePath);
        if (!src) return;
        const fullSrc = src.startsWith("http") ? src : window.location.origin + src;
        
        const playAudio = () => {
            audio.currentTime = startTime;
            audio.play().catch(console.error);
            if (sentenceId) setPlayingSentenceId(sentenceId);
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
        if (!youdaoAudioRef.current || !displayWord?.text) return;

        const audio = youdaoAudioRef.current;
        
        if (isPlayingWord) {
            audio.pause();
            setIsPlayingWord(false);
            return;
        }

        // type=1 for UK accent, type=2 for US accent
        const accentType = pronunciationAccent === 'uk' ? 1 : 2;
        const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(displayWord.text)}&type=${accentType}`;
        
        audio.src = audioUrl;
        audio.currentTime = 0;
        audio.play()
            .then(() => setIsPlayingWord(true))
            .catch(console.error);
        
        audio.onended = () => setIsPlayingWord(false);
        audio.onerror = () => setIsPlayingWord(false);
    };

    if (!displayWord) return null;

    const posList = parsePos(displayWord.pos);
    const exchangeList = parseExchange(displayWord.exchange);
    const tagList = parseTags(displayWord.tag);

    // Extract domain tags from translation
    // Logic: Look for [Tag] at the start of lines in translation
    // We use the current editTranslation if editing, or displayWord.translation
    const translationText = isEditing ? editTranslation : (displayWord.translation || "");
    const domainTags: { tag: string, content: string }[] = [];
    let displayTranslation = translationText;

    if (!isEditing && translationText) {
        const lines = translationText.split('\n');
        const cleanLines: string[] = [];
        
        lines.forEach((line: string) => {
            const match = line.match(/^\s*\[(.*?)\](.*)/);
            if (match) {
                domainTags.push({ tag: match[1], content: match[2].trim() });
                // Do NOT add to cleanLines - hide the entire line
            } else {
                cleanLines.push(line);
            }
        });
        displayTranslation = cleanLines.join('\n');
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[480px] sm:max-w-[480px] p-0 [&>button]:hidden">
                <div className="flex flex-col h-full">
                    <div className="p-6 pb-2 flex-shrink-0">
                        <SheetHeader className="p-0 space-y-1">
                            <div className="flex items-start justify-between">
                                <SheetTitle className="text-3xl font-bold">
                                    {displayWord.text}
                                </SheetTitle>
                                <div className="flex items-center gap-1 -mr-2">
                                    {isEditing ? (
                                        <>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                onClick={handleSave}
                                                disabled={isSaving}
                                                title="Save Changes"
                                            >
                                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={() => {
                                                    setIsEditing(false);
                                                    setEditDefinition(displayWord.definition || "");
                                                    setEditTranslation(displayWord.translation || "");
                                                }}
                                                title="Cancel"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </>
                                    ) : (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                            onClick={() => setIsEditing(true)}
                                            title="Edit Word Details"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                {displayWord.phonetic && <span className="text-lg font-normal text-muted-foreground font-mono">[{displayWord.phonetic}]</span>}
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={handlePlayWord}
                                    className={`h-8 w-8 ${isPlayingWord ? "text-primary animate-pulse" : "text-muted-foreground"}`}
                                    title="Play Pronunciation"
                                >
                                    {isPlayingWord ? <Pause className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                                </Button>
                            </div>

                            <SheetDescription className="flex flex-col gap-2 mt-1" asChild>
                                <div className="text-muted-foreground text-sm">
                                {(tagList.length > 0 || domainTags.length > 0) && (
                                    <div className="flex flex-wrap gap-2">
                                        {tagList.map((tag, idx) => (
                                            <Badge key={`tag-${idx}`} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-100">
                                                {tag.label}
                                            </Badge>
                                        ))}
                                        {domainTags.map((item, idx) => (
                                            <TooltipProvider key={`domain-${idx}`}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge variant="outline" className="text-muted-foreground border-dashed cursor-help">
                                                            {item.tag}
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{item.content}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        ))}
                                    </div>
                                )}
                                </div>
                            </SheetDescription>
                        </SheetHeader>
                    </div>

                    <ScrollArea className="flex-1 px-6 h-[1px]">
                        <div className="space-y-8 pb-10 pl-1 pt-2">
                            {/* Definition Section */}
                            {(displayWord.definition || isEditing) && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Definition</h3>
                                    <div className="pl-2 text-base text-gray-800 dark:text-gray-200">
                                        {isEditing ? (
                                            <Textarea 
                                                value={editDefinition}
                                                onChange={(e) => setEditDefinition(e.target.value)}
                                                className="min-h-[100px] font-sans"
                                                placeholder="Enter definition..."
                                            />
                                        ) : (
                                            <FormattedText text={displayWord.definition} />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Translation Section */}
                            {(displayWord.translation || isEditing) && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Translation</h3>
                                    <div className="pl-2 text-base">
                                        {isEditing ? (
                                            <Textarea 
                                                value={editTranslation}
                                                onChange={(e) => setEditTranslation(e.target.value)}
                                                className="min-h-[100px] font-sans"
                                                placeholder="Enter translation..."
                                            />
                                        ) : (
                                            <FormattedText text={displayTranslation} />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Relations Section - Moved here */}
                            <div className="space-y-3 border-t pt-6">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Relations</h3>
                                <div className="pl-4 space-y-4">
                                    {/* List existing relations */}
                                    {loadingRelations ? (
                                        <div className="flex items-center text-sm text-muted-foreground">
                                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                            Loading relations...
                                        </div>
                                    ) : relations.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {relations.map(rel => {
                                                const type = rel.relationType || rel.relation_type;
                                                const text = rel.customText || rel.custom_text || rel.relatedWord?.text;
                                                
                                                return (
                                                <Badge key={rel.id} variant="outline" className="pl-2 pr-1 py-1 flex items-center gap-1">
                                                    <span className="text-[10px] font-bold text-muted-foreground mr-1 bg-muted px-1 rounded">
                                                        {type === 'SYNONYM' ? 'SYN' : 
                                                         type === 'ANTONYM' ? 'ANT' : 
                                                         type === 'IDIOM' ? 'IDM' : (type ? type.substring(0, 3) : '???')}
                                                    </span>
                                                    <span>{text}</span>
                                                    {isEditing && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-4 w-4 ml-1 hover:bg-destructive/20 hover:text-destructive rounded-full"
                                                            onClick={() => handleRemoveRelation(rel.id)}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </Badge>
                                            )})}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">No relations added yet.</p>
                                    )}

                                    {/* Add new relation form - Only visible in edit mode */}
                                    {isEditing && (
                                        <div className="flex gap-2 items-center">
                                            <Select value={newRelationType} onValueChange={setNewRelationType}>
                                                <SelectTrigger className="w-[110px] h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="SYNONYM">Synonym</SelectItem>
                                                    <SelectItem value="ANTONYM">Antonym</SelectItem>
                                                    <SelectItem value="IDIOM">Idiom</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Input 
                                                value={newRelationText}
                                                onChange={(e) => setNewRelationText(e.target.value)}
                                                placeholder="Add related word..."
                                                className="h-8 text-sm"
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddRelation()}
                                            />
                                            <Button 
                                                size="sm" 
                                                variant="secondary" 
                                                className="h-8 px-2"
                                                onClick={handleAddRelation}
                                                disabled={!newRelationText.trim() || isAddingRelation}
                                            >
                                                {isAddingRelation ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* POS Distribution Section */}
                            {posList.length > 0 && !isEditing && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Part of Speech</h3>
                                    <div className="pl-2 space-y-3">
                                        {posList
                                            .map(p => ({
                                                ...p,
                                                value: parseInt(p.percentage?.replace('%', '') || '0')
                                            }))
                                            .sort((a, b) => b.value - a.value)
                                            .map((pos, idx) => (
                                                <div key={idx} className="flex items-center gap-3 text-base">
                                                    <div className="w-12 text-right font-serif italic text-muted-foreground">{pos.label}</div>
                                                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-primary/60 rounded-full" 
                                                            style={{ width: `${pos.value}%` }}
                                                        />
                                                    </div>
                                                    <div className="w-10 text-sm text-muted-foreground tabular-nums">{pos.value}%</div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}

                            {/* Word Forms Section */}
                            {exchangeList.length > 0 && !isEditing && (
                                <div className="space-y-3">
                                     <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Word Forms</h3>
                                     <div className="pl-2">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                                            {exchangeList.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-baseline border-b border-dotted border-muted-foreground/20 pb-1">
                                                    <span className="text-muted-foreground text-xs tracking-wide">{item.label}</span>
                                                    <span className="font-medium font-mono text-sm">{item.word}</span>
                                                </div>
                                            ))}
                                        </div>
                                     </div>
                                </div>
                            )}
                            
                            {/* Stats Section */}
                            {(displayWord.collins || displayWord.bnc || displayWord.frq || displayWord.oxford) && !isEditing && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-l-4 border-primary/20 pl-3">Statistics</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pl-4">
                                        {displayWord.collins && (
                                            <div className="bg-muted/30 p-3 rounded-lg border text-center">
                                                <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Collins</div>
                                                <div className="flex justify-center text-yellow-500 text-sm">
                                                    {"★".repeat(Number(displayWord.collins))}
                                                    <span className="text-muted-foreground/20">{"★".repeat(5 - Number(displayWord.collins))}</span>
                                                </div>
                                            </div>
                                        )}
                                        {displayWord.bnc && (
                                            <div className="bg-muted/30 p-3 rounded-lg border text-center">
                                                <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">BNC Rank</div>
                                                <div className="font-mono font-semibold">{displayWord.bnc}</div>
                                            </div>
                                        )}
                                        {displayWord.frq && (
                                            <div className="bg-muted/30 p-3 rounded-lg border text-center">
                                                <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Frequency</div>
                                                <div className="font-mono font-semibold">{displayWord.frq}</div>
                                            </div>
                                        )}
                                        {displayWord.oxford === 1 && (
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
                                 <div className="pl-2">
                                     {loadingCtx ? (
                                         <div className="flex items-center text-sm text-muted-foreground py-4">
                                             <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                             Loading examples...
                                         </div>
                                     ) : occurrences.length > 0 ? (
                                         <div className="space-y-6">
                    {occurrences.map((occ, index) => {
                        const sentenceId = occ?.sentence?.id ?? occ?.sentence?.$id ?? occ?.sentence_id;
                         // Helper function to highlight the word in sentence
                         const highlightSentence = () => {
                             const content = occ.sentence.content;
                                                     
                                                     // First, try to use start_index/end_index if available
                                                     if (occ.start_index !== undefined && occ.end_index !== undefined &&
                                                         occ.start_index >= 0 && occ.end_index > occ.start_index &&
                                                         occ.end_index <= content.length) {
                                                         const before = content.substring(0, occ.start_index);
                                                         const wordInSentence = content.substring(occ.start_index, occ.end_index);
                                                         const after = content.substring(occ.end_index);
                                                         return (
                                                             <span>
                                                                 {before}
                                                                 <span className="font-bold text-primary bg-primary/10 rounded px-0.5">{wordInSentence}</span>
                                                                 {after}
                                                             </span>
                                                         );
                                                     }
                                                     
                                                     // Fallback: use word forms from exchange field to match
                                                     const wordForms = getAllWordForms(displayWord.text, displayWord.exchange);
                                                     const regex = createWordFormsRegex(wordForms);
                                                     
                                                     return (
                                                         <span dangerouslySetInnerHTML={{ 
                                                             __html: content.replace(
                                                                 regex, 
                                                                 '<span class="font-bold text-primary bg-primary/10 rounded px-0.5">$1</span>'
                                                             ) 
                                                         }} />
                                                     );
                                                 };
                                                 
                        return (
                        <div key={occ.id ?? occ.$id ?? sentenceId ?? index} className="flex gap-3 group border-b border-border/40 pb-4 last:border-0 last:pb-0">
                                                     <div className="text-muted-foreground font-mono text-lg font-medium pt-0.5 w-6 text-right shrink-0 select-none opacity-50">{index + 1}.</div>
                                                     <div className="flex-1 space-y-2">
                                                         <div className="flex items-start justify-between gap-3">
                                                             <div className="text-base leading-relaxed text-gray-800 dark:text-gray-200">
                                                                 {highlightSentence()}
                                                             </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className={`h-6 w-6 shrink-0 mt-1 transition-colors ${playingSentenceId === sentenceId ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
                                        onClick={() => handlePlaySentence(occ.sentence)}
                                    >
                                        {playingSentenceId === sentenceId ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                    </Button>
                                                         </div>
                                                         <div className="flex justify-end">
                                                             <Link 
                                                                 href={`/study/sentences/${occ.sentence.id}`}
                                                                 className="inline-flex items-center text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
                                                                 onClick={(e) => e.stopPropagation()}
                                                             >
                                                                 <span>{occ.sentence.material.title}</span>
                                                                 <ExternalLink className="w-3 h-3 ml-1" />
                                                             </Link>
                                                         </div>
                                                     </div>
                                                 </div>
                                                 );
                                             })}
                                         </div>
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
