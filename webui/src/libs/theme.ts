import { createTheme, DEFAULT_THEME } from "@mantine/core";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

export const theme = createTheme({
  fontFamily: `${GeistSans.style.fontFamily}, ${DEFAULT_THEME.fontFamily}`,
  fontFamilyMonospace: `${GeistMono.style.fontFamily}, ${DEFAULT_THEME.fontFamilyMonospace}`,
});
