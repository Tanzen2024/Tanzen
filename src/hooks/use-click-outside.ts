import { useEffect, type RefObject } from 'react';

export function useClickOutside(refs: RefObject<HTMLElement>[], onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onOutside();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [refs, onOutside, active]);
}
