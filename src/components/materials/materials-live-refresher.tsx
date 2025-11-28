"use client"

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface MaterialsLiveRefresherProps {
  watchList: string[];
  intervalMs?: number;
}

export function MaterialsLiveRefresher({ watchList, intervalMs = 8000 }: MaterialsLiveRefresherProps) {
  const router = useRouter();
  const watchKey = watchList.slice().sort().join(",");
  const shouldWatch = watchList.length > 0;

  useEffect(() => {
    if (!shouldWatch) return;

    // Quick refresh once to shorten perceived delay
    const initial = setTimeout(() => router.refresh(), 1500);

    // Keep refreshing while there are pending materials
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [intervalMs, router, shouldWatch, watchKey]);

  return null;
}
