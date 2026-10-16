import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/global.css";
import { SessionProvider } from "./lib/session";
import { Toaster } from "./components/arc";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
        <Toaster />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
