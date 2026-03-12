import React from "react";
import { createRoot } from "react-dom/client";
import "@fortawesome/fontawesome-svg-core/styles.css";
import App from "./App";
import "./styles.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("missing #root");
}

(window as any).CESIUM_BASE_URL = "/cesium";

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);