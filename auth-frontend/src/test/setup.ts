// The Vitest entry: it adds the matchers to Vitest's expect types too.
import "@testing-library/jest-dom/vitest";

// Mock window.matchMedia for theme detection
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {}, // deprecated
        removeListener: () => {}, // deprecated
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});
