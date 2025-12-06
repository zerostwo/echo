'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, eachDayOfInterval, startOfDay, getDay, startOfYear, endOfYear, isToday } from 'date-fns';
import { useMemo, useState } from 'react';

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
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  // Get available years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear); // Always include current year
    data.forEach((d) => {
      const year = new Date(d.date).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a); // Sort descending
  }, [data, currentYear]);

  const { weeks, maxDuration, dataMap, monthLabels } = useMemo(() => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = selectedYear === currentYear 
      ? startOfDay(new Date()) 
      : endOfYear(new Date(selectedYear, 0, 1));

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
    const activeDays = yearData.filter(d => d.duration > 0).length;
    return { totalDuration, activeDays };
  }, [data, selectedYear]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <div className="flex items-center gap-4">
          <Tabs value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <TabsList className="h-8">
              {availableYears.map((year) => (
                <TabsTrigger key={year} value={year.toString()} className="text-xs px-3">
                  {year}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span>{yearStats.activeDays} active days</span>
            <span>{formatDuration(yearStats.totalDuration)} total</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <TooltipProvider delayDuration={100}>
          <div className="w-full">
            <div className="flex flex-col">
              {/* Month labels row */}
              <div className="flex mb-1">
                <div className="w-8 shrink-0 hidden sm:block" />
                <div className="flex flex-1 justify-between">
                  {monthLabels.map(({ month, weekIndex }, i) => {
                    const nextWeekIndex = monthLabels[i + 1]?.weekIndex ?? weeks.length;
                    const colspan = nextWeekIndex - weekIndex;
                    return (
                      <div
                        key={`${month}-${weekIndex}`}
                        className="text-xs text-muted-foreground font-medium"
                        style={{ 
                          flex: colspan,
                          minWidth: 0,
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
                <div className="hidden sm:flex flex-col gap-[3px] mr-1 w-7">
                  {DAY_LABELS.map((day, index) => (
                    <div 
                      key={day} 
                      className="h-[13px] text-[10px] text-muted-foreground flex items-center justify-end pr-1"
                    >
                      {index % 2 === 1 ? day : ''}
                    </div>
                  ))}
                </div>
                
                {/* Heatmap grid - use flex to fill available space */}
                <div className="flex gap-[3px] flex-1 justify-between">
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
              
              {/* Legend and mobile stats */}
              <div className="flex items-center justify-between mt-3 sm:ml-8">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>less</span>
                  {[0, 1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-[13px] w-[13px] rounded-[3px] ${heatmapColors[level]}`}
                    />
                  ))}
                  <span>more</span>
                </div>
                <div className="flex sm:hidden items-center gap-3 text-xs text-muted-foreground">
                  <span>{yearStats.activeDays} days</span>
                  <span>{formatDuration(yearStats.totalDuration)}</span>
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
