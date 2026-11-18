import "@mantine/core/styles.css";
import "@mantine/carousel/styles.css";
import "./app/globals.css";
import "./app/fonts.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { NavigationProvider } from "@/libs/nav";

import { App } from "./app/App";
import { Providers } from "./app/providers";

const root = document.getElementById("root");
if (!root) throw new Error("root element is missing");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <NavigationProvider>
        <App />
      </NavigationProvider>
    </Providers>
  </StrictMode>,
);
