import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import "@mantine/core/styles.css";
import "./style.css";
import App from "./App";
const theme = createTheme({
  primaryColor: "teal",
  defaultRadius: "md",
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontFamily: "inherit", fontWeight: "650" },
  colors: {
    teal: [
      "#eaf6f3",
      "#cce9df",
      "#a6d7c5",
      "#7bc4a9",
      "#55b492",
      "#3ca982",
      "#299d74",
      "#1c8863",
      "#147653",
      "#096545",
    ],
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>,
);
