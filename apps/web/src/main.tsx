import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { initTheme } from "./lib/theme.js";
import { LibraryProvider } from "./store/LibraryContext.js";
import "./styles.css";

// Before the first paint, or the app flashes the wrong theme on every load.
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LibraryProvider>
      <App />
    </LibraryProvider>
  </StrictMode>,
);
