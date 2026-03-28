import React from "react";
import ReactDOM from "react-dom/client";
import { useState, useEffect } from "react";
import App from "./App";
import SpeedDating from "./SpeedDating";
import "./index.css";

function Router() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (path === "/speed-dating") return <SpeedDating />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
