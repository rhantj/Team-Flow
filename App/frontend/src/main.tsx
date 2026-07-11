
  import { createRoot } from "react-dom/client";
  import App from "./App";
  import "./global/styles/index.css";

  if (new URLSearchParams(window.location.search).get("capture") === "1") {
    const captureParams = new URLSearchParams(window.location.search);
    document.documentElement.classList.add("capture-canvas");
    document.documentElement.style.setProperty("--capture-x", `-${Number(captureParams.get("captureX") ?? 0)}px`);
    document.documentElement.style.setProperty("--capture-y", `-${Number(captureParams.get("captureY") ?? 0)}px`);
  }

  createRoot(document.getElementById("root")!).render(<App />);
  
