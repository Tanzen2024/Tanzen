import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetDemoIdentity } from '@/mocks/demo-identity';

// jsdom does not implement matchMedia — needed by ThemeContext's system-theme detection.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

// jsdom does not implement ResizeObserver / scrollIntoView — needed by the cmdk-based
// searchable pickers (`@/components/ui/command`, e.g. the quick-entry member picker).
if (!('ResizeObserver' in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Identité de démonstration (« Agir en tant que ») : jamais propagée d'un test à l'autre.
  resetDemoIdentity();
});
