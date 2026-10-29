import "@mantine/core/styles.css";
import "@mantine/carousel/styles.css";
import "./globals.css";

import { ColorSchemeScript, Container, mantineHtmlProps } from "@mantine/core";
import type { Metadata } from "next";
import { ReactNode } from "react";

import { AppHeader } from "@/components/backoffice/AppHeader";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Inventory Manage Backoffice",
  description: "Manage units, stock, and bills of materials",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <Providers>
          <AppHeader />
          <Container component="main" size={1280} py="lg" px="md">
            {children}
          </Container>
        </Providers>
      </body>
    </html>
  );
}
