// Extend Matchers
import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

// Mock for Font imports
vi.mock("geist/font/mono", () => ({
  GeistMono: {
    style: { fontFamily: "Geist Mono" },
  },
}));

vi.mock("geist/font/sans", () => ({
  GeistSans: {
    style: { fontFamily: "Geist Sans" },
  },
}));

// Stub for Mantine components
const { getComputedStyle } = window;
window.getComputedStyle = (elt) => getComputedStyle(elt);
window.HTMLElement.prototype.scrollIntoView = () => {};

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserver;
