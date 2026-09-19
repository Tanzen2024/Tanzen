import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type StatusTone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'orange';
export type NavigationItem = { label: string; path: string; icon: LucideIcon; badge?: string };
export type TableColumn<T> = { key: string; header: string; render?: (row: T) => ReactNode; className?: string };
