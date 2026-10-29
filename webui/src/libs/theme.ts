import {
  createTheme,
  DEFAULT_THEME,
  type MantineColorsTuple,
} from "@mantine/core";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

// Deep teal; shade 8 is the primary so white button text clears 4.5:1
const signal: MantineColorsTuple = [
  "#e8f6f3",
  "#d2ece6",
  "#a3d8cd",
  "#71c3b2",
  "#49b19c",
  "#30a68e",
  "#20a086",
  "#0f8c74",
  "#007c66",
  "#006b57",
];

export const theme = createTheme({
  fontFamily: `${GeistSans.style.fontFamily}, ${DEFAULT_THEME.fontFamily}`,
  fontFamilyMonospace: `${GeistMono.style.fontFamily}, ${DEFAULT_THEME.fontFamilyMonospace}`,
  colors: { signal },
  primaryColor: "signal",
  primaryShade: 8,
  defaultRadius: "sm",
  cursorType: "pointer",
  headings: {
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "1.5rem", lineHeight: "1.25" },
      h2: { fontSize: "0.9375rem", lineHeight: "1.4" },
      h3: { fontSize: "0.875rem", lineHeight: "1.4" },
    },
  },
});
