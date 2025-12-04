'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, eachDayOfInterval, startOfDay, getDay, startOfYear, endOfYear, isToday } from 'date-fns';
import { useMemo } from 'react';

interface HeatmapData {
  date: string;
  duration: number; // seconds
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return 'No activity';
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Get intensity level (0-4) based on duration
function getIntensityLevel(duration: number, maxDuration: number): number {
  if (duration === 0) return 0;
  const ratio = duration / maxDuration;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

// Heatmap color classes (green theme)
const heatmapColors: Record<number, string> = {
  0: 'bg-muted hover:bg-muted/80',
  1: 'bg-green-200 dark:bg-green-900 hover:bg-green-300 dark:hover:bg-green-800',
  2: 'bg-green-400 dark:bg-green-700 hover:bg-green-500 dark:hover:bg-green-600',
  3: 'bg-green-500 dark:bg-green-500 hover:bg-green-600 dark:hover:bg-green-400',
  4: 'bg-green-700 dark:bg-green-400 hover:bg-green-800 dark:hover:bg-green-300',
};

// Day labels (Sun to Sat)
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const { weeks, maxDuration, dataMap, monthLabels } = useMemo(() => {
    const today = startOfDay(new Date());
    const yearStart = startOfYear(today);
    const yearEnd = endOfYear(today);

    // Create a map of date -> duration
    const dataMap = new Map<string, number>();
    data.forEach((d) => {
      dataMap.set(d.date, d.duration);
    });

    // Get all days in the year
    const days = eachDayOfInterval({ start: yearStart, end: yearEnd });
    
    // Find max duration for scaling (minimum 60 seconds to avoid division issues)
    const maxDuration = Math.max(...data.map((d) => d.duration), 60);

    // Group by week for GitHub-style layout (columns = weeks, rows = days of week)
    // Week starts on Sunday (0)
    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];
    
    // Pad the first week with nulls if year doesn't start on Sunday
    const firstDayOfWeek = getDay(yearStart);
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null);
    }
    
    days.forEach((day) => {
      const dayOfWeek = getDay(day);
      
      // Start a new week on Sunday (after we've pushed the previous week)
      if (dayOfWeek === 0 && currentWeek.length > 0) {
        // Pad current week to 7 days if needed
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        weeks.push(currentWeek);
        currentWeek = [];
      }
      
      currentWeek.push(day);
    });
    
    // Push the last week
    if (currentWeek.length > 0) {
      // Pad to 7 days if needed
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    // Generate month labels with their starting week index
    const monthLabels: { month: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, weekIndex) => {
      const firstValidDay = week.find(d => d !== null);
      if (firstValidDay) {
        const month = firstValidDay.getMonth();
        if (month !== lastMonth) {
          monthLabels.push({ 
            month: format(firstValidDay, 'MMM'), 
            weekIndex 
          });
          lastMonth = month;
        }
      }
    });

    return { weeks, maxDuration, dataMap, monthLabels };
  }, [data]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 sm:p-4 md:p-6">
        <TooltipProvider delayDuration={100}>
          <div className="w-full overflow-x-auto">
            <div className="inline-flex flex-col min-w-fit">
              {/* Month labels row */}
              <div className="flex mb-1">
                {/* Empty space for day labels column */}
                <div className="w-8 shrink-0 hidden sm:block" />
                <div className="flex">
                  {monthLabels.map(({ month, weekIndex }, i) => {
                    const nextWeekIndex = monthLabels[i + 1]?.weekIndex ?? weeks.length;
                    const colspan = nextWeekIndex - weekIndex;
                    return (
                      <div
                        key={`${month}-${weekIndex}`}
                        className="text-xs text-muted-foreground font-medium"
                        style={{ 
                          width: `${colspan * 16}px`,
                          minWidth: `${colspan * 16}px`,
                          paddingLeft: i === 0 ? '0' : '2px'
                        }}
                      >
                        {month}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Main grid with day labels */}
              <div className="flex">
                {/* Day labels column - hidden on mobile */}
                <div className="hidden sm:flex flex-col gap-[3px] mr-1 w-7">
                  {DAY_LABELS.map((day, index) => (
                    <div 
                      key={day} 
                      className="h-[13px] text-[10px] text-muted-foreground flex items-center justify-end pr-1"
                    >
                      {/* Only show Mon, Wed, Fri for cleaner look */}
                      {index % 2 === 1 ? day : ''}
                    </div>
                  ))}
                </div>
                
                {/* Heatmap grid */}
                <div className="flex gap-[3px]">
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-[3px]">
                      {week.map((day, dayIndex) => {
                        if (!day) {
                          return <div key={dayIndex} className="h-[13px] w-[13px]" />;
                        }
                        
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const duration = dataMap.get(dateStr) || 0;
                        const level = getIntensityLevel(duration, maxDuration);
                        const isTodayDate = isToday(day);
                        
                        return (
                          <Tooltip key={dayIndex}>
                            <TooltipTrigger asChild>
                              <div
                                className={`
                                  h-[13px] w-[13px] rounded-[3px] cursor-pointer transition-colors
                                  ${heatmapColors[level]}
                                  ${isTodayDate ? 'ring-1 ring-foreground ring-offset-1 ring-offset-background' : ''}
                                `}
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <p className="font-medium">{format(day, 'EEEE, MMM d, yyyy')}</p>
                              <p className="text-muted-foreground">{formatDuration(duration)}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Legend - positioned below heatmap, left-aligned on mobile */}
              <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground sm:ml-8">
                <span>less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-[13px] w-[13px] rounded-[3px] ${heatmapColors[level]}`}
                  />
                ))}
                <span>more</span>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
