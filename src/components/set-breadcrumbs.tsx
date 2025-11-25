'use client';

import { useEffect } from 'react';
import { useBreadcrumb, BreadcrumbItem } from '@/context/breadcrumb-context';

export function SetBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const { setItems } = useBreadcrumb();

  useEffect(() => {
    setItems(items);
  }, [items, setItems]);

  return null;
}

