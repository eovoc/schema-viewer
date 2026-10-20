import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SchemaViewerPage from "./SchemaViewerPage";
import "./demo.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SchemaViewerPage />
  </StrictMode>
);
