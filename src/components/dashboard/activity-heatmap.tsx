'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, eachDayOfInterval, startOfDay, getDay, startOfYear, endOfYear, isToday, subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';

interface HeatmapData {
  date: string;
  duration: number; // seconds
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0m';
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
  0: 'bg-slate-100 dark:bg-slate-800',
  1: 'bg-emerald-200 dark:bg-emerald-900',
  2: 'bg-emerald-300 dark:bg-emerald-700',
  3: 'bg-emerald-400 dark:bg-emerald-500',
  4: 'bg-emerald-500 dark:bg-emerald-400',
};

// Day labels (Sun to Sat)
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear] = useState(currentYear);
  
  const { weeks, maxDuration, dataMap, monthLabels } = useMemo(() => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1));

    // Create a map of date -> duration
    const dataMap = new Map<string, number>();
    data.forEach((d) => {
      dataMap.set(d.date, d.duration);
    });

    // Get all days in the year (up to today if current year)
    const days = eachDayOfInterval({ start: yearStart, end: yearEnd });
    
    // Find max duration for scaling (minimum 60 seconds to avoid division issues)
    const yearData = data.filter(d => new Date(d.date).getFullYear() === selectedYear);
    const maxDuration = Math.max(...yearData.map((d) => d.duration), 60);

    // Group by week for GitHub-style layout (columns = weeks, rows = days of week)
    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];
    
    // Pad the first week with nulls if year doesn't start on Sunday
    const firstDayOfWeek = getDay(yearStart);
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null);
    }
    
    days.forEach((day) => {
      const dayOfWeek = getDay(day);
      
      if (dayOfWeek === 0 && currentWeek.length > 0) {
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        weeks.push(currentWeek);
        currentWeek = [];
      }
      
      currentWeek.push(day);
    });
    
    if (currentWeek.length > 0) {
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
  }, [data, selectedYear, currentYear]);

  // Calculate year stats
  const yearStats = useMemo(() => {
    const yearData = data.filter(d => new Date(d.date).getFullYear() === selectedYear);
    const totalDuration = yearData.reduce((acc, d) => acc + d.duration, 0);
    
    // Calculate streak
    let streak = 0;
    const today = startOfDay(new Date());
    let currentDay = today;
    
    // Check if today has activity, if not check yesterday to start streak
    const todayStr = format(today, 'yyyy-MM-dd');
    if (!dataMap.has(todayStr) || dataMap.get(todayStr) === 0) {
        currentDay = subDays(today, 1);
    }

    while (true) {
        const dateStr = format(currentDay, 'yyyy-MM-dd');
        const duration = dataMap.get(dateStr) || 0;
        if (duration > 0) {
            streak++;
            currentDay = subDays(currentDay, 1);
        } else {
            break;
        }
        // Safety break for infinite loops (though shouldn't happen with subDays)
        if (currentDay.getFullYear() < selectedYear) break;
    }

    return { totalDuration, streak };
  }, [data, selectedYear, dataMap]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-2 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-muted-foreground" />
          Activity
        </CardTitle>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`h-2.5 w-2.5 rounded-[2px] ${heatmapColors[level]}`}
            />
          ))}
          <span>More</span>
        </div>
      </CardHeader>
      <CardContent className="pb-2 flex-1 flex flex-col justify-between">
        <TooltipProvider delayDuration={100}>
          <div className="w-full overflow-x-auto pb-2">
            <div className="min-w-[600px]">
              {/* Month labels row */}
              <div className="flex mb-2">
                <div className="w-8 shrink-0" />
                <div className="flex flex-1 relative h-4">
                  {monthLabels.map(({ month, weekIndex }) => (
                    <div
                      key={`${month}-${weekIndex}`}
                      className="absolute text-xs text-muted-foreground"
                      style={{ 
                        left: `${(weekIndex / weeks.length) * 100}%`
                      }}
                    >
                      {month}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Main grid with day labels */}
              <div className="flex">
                <div className="flex flex-col justify-between mr-2 w-6 pb-1">
                  {DAY_LABELS.map((day, index) => (
                    <div 
                      key={index} 
                      className="h-[10px] text-[10px] text-muted-foreground flex items-center justify-end leading-none"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Heatmap grid */}
                <div className="flex gap-[3px] flex-1 overflow-hidden">
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col justify-between gap-[3px] flex-1 min-w-0">
                      {week.map((day, dayIndex) => {
                        if (!day) {
                          return <div key={dayIndex} className="h-[10px] w-full aspect-square" />;
                        }
                        
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const duration = dataMap.get(dateStr) || 0;
                        const level = getIntensityLevel(duration, maxDuration);
                        
                        return (
                          <Tooltip key={dayIndex}>
                            <TooltipTrigger asChild>
                              <div
                                className={`
                                  w-full aspect-square rounded-[2px]
                                  ${heatmapColors[level]}
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
            </div>
          </div>
        </TooltipProvider>

        {/* Stats Footer */}
        <div className="grid grid-cols-3 gap-4 mt-2 pt-2">
            <div className="text-center">
                <div className="text-2xl font-bold">{selectedYear}</div>
                <div className="text-xs text-muted-foreground">Active Year</div>
            </div>
            <div className="text-center">
                <div className="text-2xl font-bold">{yearStats.streak}</div>
                <div className="text-xs text-muted-foreground">Day Streak</div>
            </div>
            <div className="text-center">
                <div className="text-2xl font-bold">&nbsp;{formatDuration(yearStats.totalDuration)}</div>
                <div className="text-xs text-muted-foreground">Total Time</div>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
