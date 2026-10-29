"use client";

import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

import { theme } from "@/libs/theme";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      {children}
    </MantineProvider>
  );
}
