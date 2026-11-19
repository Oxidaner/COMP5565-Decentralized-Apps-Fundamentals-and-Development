import "@testing-library/jest-dom/vitest";

// Vitest 3 can retain Node 24's unavailable global storage instead of jsdom's.
const dom = (globalThis as unknown as { jsdom: { window: Window } }).jsdom;
Object.defineProperty(window, "localStorage", { configurable: true, value: dom.window.localStorage });
