import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SchemaViewerPage from "./pages/SchemaViewerPage";
import "./styles/demo.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SchemaViewerPage />
  </StrictMode>
);
