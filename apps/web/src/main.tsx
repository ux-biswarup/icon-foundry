import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { LibraryProvider } from "./store/LibraryContext.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LibraryProvider>
      <App />
    </LibraryProvider>
  </StrictMode>,
);
