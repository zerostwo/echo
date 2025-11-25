"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format } from "date-fns"

interface DailyStudyStat {
    date: Date | string
    studyDuration: number
    wordsAdded: number
    sentencesAdded: number
}

interface DailyActivityChartProps {
    data: DailyStudyStat[]
}

export function DailyActivityChart({ data }: DailyActivityChartProps) {
    // Sort data by date ascending just in case
    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Find max values for scaling
    const maxDuration = Math.max(...data.map(d => d.studyDuration), 1); // Avoid division by zero
    
    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Weekly Activity</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] w-full flex items-end justify-between gap-2 pt-4">
                    {sortedData.map((day, i) => {
                        const height = (day.studyDuration / maxDuration) * 100;
                        return (
                            <div key={i} className="flex flex-col items-center gap-2 flex-1 group relative">
                                <div className="w-full bg-secondary rounded-t-md relative overflow-hidden hover:bg-secondary/80 transition-colors" style={{ height: `${Math.max(height, 4)}%` }}>
                                   {/* Tooltip-ish overlay on hover could go here */}
                                </div>
                                <div className="text-xs text-muted-foreground text-center">
                                    {format(new Date(day.date), "EEE")}
                                </div>
                                
                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-popover text-popover-foreground p-2 rounded shadow text-xs z-10 min-w-[120px]">
                                    <p className="font-semibold">{format(new Date(day.date), "MMM d")}</p>
                                    <p>Study: {Math.round(day.studyDuration / 60)} min</p>
                                    <p>Words: {day.wordsAdded}</p>
                                    <p>Sentences: {day.sentencesAdded}</p>
                                </div>
                            </div>
                        )
                    })}
                    {data.length === 0 && (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            No activity recorded yet
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

