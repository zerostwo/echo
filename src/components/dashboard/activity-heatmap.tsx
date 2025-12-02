'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, eachDayOfInterval, startOfDay, subMonths, getDay, startOfWeek, endOfWeek } from 'date-fns';
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

function getIntensityClass(duration: number, maxDuration: number): string {
  if (duration === 0) return 'bg-muted';
  const ratio = duration / maxDuration;
  if (ratio >= 0.75) return 'bg-green-600 dark:bg-green-500';
  if (ratio >= 0.5) return 'bg-green-500 dark:bg-green-400';
  if (ratio >= 0.25) return 'bg-green-400 dark:bg-green-300';
  return 'bg-green-300 dark:bg-green-200';
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const { weeks, maxDuration, dataMap, monthLabels } = useMemo(() => {
    const today = startOfDay(new Date());
    // Go back ~6 months to fill the width nicely
    const endDate = endOfWeek(today, { weekStartsOn: 0 });
    const startDate = startOfWeek(subMonths(today, 5), { weekStartsOn: 0 });

    // Create a map of date -> duration
    const dataMap = new Map<string, number>();
    data.forEach((d) => {
      dataMap.set(d.date, d.duration);
    });

    // Get all days in the range
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Find max duration for scaling (minimum 60 seconds to avoid division issues)
    const maxDuration = Math.max(...data.map((d) => d.duration), 60);

    // Group by week for GitHub-style layout (columns = weeks, rows = days)
    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];
    
    days.forEach((day) => {
      const dayOfWeek = getDay(day);
      
      // Start a new week on Sunday
      if (dayOfWeek === 0 && currentWeek.length > 0) {
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

    // Generate month labels
    const monthLabels: { month: string; weekIndex: number }[] = [];
    let lastMonth = '';
    weeks.forEach((week, weekIndex) => {
      const firstDay = week.find(d => d !== null);
      if (firstDay) {
        const month = format(firstDay, 'MMM');
        if (month !== lastMonth) {
          monthLabels.push({ month, weekIndex });
          lastMonth = month;
        }
      }
    });

    return { weeks, maxDuration, dataMap, monthLabels };
  }, [data]);

  const weekDayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-sm font-medium">Study Activity</CardTitle>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="h-2.5 w-2.5 rounded-sm bg-muted" />
          <div className="h-2.5 w-2.5 rounded-sm bg-green-300 dark:bg-green-200" />
          <div className="h-2.5 w-2.5 rounded-sm bg-green-400 dark:bg-green-300" />
          <div className="h-2.5 w-2.5 rounded-sm bg-green-500 dark:bg-green-400" />
          <div className="h-2.5 w-2.5 rounded-sm bg-green-600 dark:bg-green-500" />
          <span>More</span>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <TooltipProvider>
          <div className="w-full overflow-x-auto">
            {/* Month labels */}
            <div className="flex mb-1 ml-8">
              {monthLabels.map(({ month, weekIndex }, i) => {
                const nextWeekIndex = monthLabels[i + 1]?.weekIndex ?? weeks.length;
                const width = nextWeekIndex - weekIndex;
                return (
                  <div
                    key={`${month}-${weekIndex}`}
                    className="text-xs text-muted-foreground"
                    style={{ 
                      width: `${width * 12}px`,
                      minWidth: `${width * 12}px`
                    }}
                  >
                    {month}
                  </div>
                );
              })}
            </div>
            
            <div className="flex">
              {/* Day labels */}
              <div className="flex flex-col gap-[3px] pr-2 text-xs text-muted-foreground shrink-0">
                {weekDayLabels.map((day, i) => (
                  <div key={i} className="h-[10px] leading-[10px] text-[10px]">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Weeks grid - fills available width */}
              <div className="flex gap-[3px] flex-1 justify-between">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {week.map((day, dayIndex) => {
                      if (!day) {
                        return <div key={dayIndex} className="h-[10px] w-[10px]" />;
                      }
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const duration = dataMap.get(dateStr) || 0;
                      const intensityClass = getIntensityClass(duration, maxDuration);
                      
                      return (
                        <Tooltip key={dayIndex}>
                          <TooltipTrigger asChild>
                            <div
                              className={`h-[10px] w-[10px] rounded-sm ${intensityClass} cursor-pointer transition-colors hover:ring-1 hover:ring-foreground/30`}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">{format(day, 'MMM d, yyyy')}</p>
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
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
