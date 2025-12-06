
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, BookOpen, Clock, FileText, GraduationCap, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaterialHeaderActions } from "./material-header-actions";
import Link from "next/link";

interface MaterialStatsCardProps {
    material: {
        id: string;
        title: string;
        size: number;
        isProcessed: boolean;
        duration: number | null;
        sentences: { id: string }[];
        mimeType: string | null;
        stats?: {
            totalSentences: number;
            vocabCount: number;
        };
    };
    vocabCount: number;
    wpm: number;
}

export function MaterialStatsCard({ material, vocabCount, wpm }: MaterialStatsCardProps) {
    const router = useRouter();
    const isVideo = material.mimeType?.startsWith('video/');
    const sentenceCount = material.stats?.totalSentences ?? material.sentences.length;

    useEffect(() => {
        if (material.isProcessed) return;
        const interval = setInterval(() => router.refresh(), 4000);
        return () => clearInterval(interval);
    }, [material.isProcessed, router]);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-2xl font-bold">{material.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            {(material.size / 1024 / 1024).toFixed(1)} MB • {material.isProcessed ? 'Ready to practice' : 'Processing...'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <MaterialHeaderActions materialId={material.id} />
                        {vocabCount > 0 && (
                            <Link href={`/study/words?materialId=${material.id}`}>
                                <Button variant="outline" className="gap-2">
                                    <GraduationCap className="h-4 w-4" /> Learn Words
                                </Button>
                            </Link>
                        )}
                        {material.sentences.length > 0 && (
                            <Link href={`/study/sentences/${material.sentences[0].id}`}>
                                <Button className="gap-2">
                                    <PlayCircle className="h-4 w-4" /> Start Practice
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="flex flex-col space-y-1.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Duration
                        </span>
                        <span className="text-2xl font-bold">
                            {material.duration ? formatDuration(material.duration) : "--:--"}
                        </span>
                    </div>
                    <div className="flex flex-col space-y-1.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <BookOpen className="h-3 w-3" /> Vocabulary
                        </span>
                        <span className="text-2xl font-bold">{vocabCount}</span>
                    </div>
                    <div className="flex flex-col space-y-1.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Activity className="h-3 w-3" /> Words/Min
                        </span>
                        <span className="text-2xl font-bold">{wpm.toFixed(0)}</span>
                    </div>
                    <div className="flex flex-col space-y-1.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Sentences
                        </span>
                        <span className="text-2xl font-bold">{sentenceCount}</span>
                    </div>
                </div>

                <div className="mt-6 bg-secondary/20 rounded-lg p-4">
                    {isVideo ? (
                        <video 
                            controls 
                            className="w-full max-h-[500px] rounded-md" 
                            src={`/api/materials/${material.id}/stream`} 
                        />
                    ) : (
                        <audio 
                            controls 
                            className="w-full" 
                            src={`/api/materials/${material.id}/stream`} 
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
