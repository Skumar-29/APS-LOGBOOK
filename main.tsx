import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "./context";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="loading">
        <h1>The page could not open</h1>
        <p>Your saved records remain on this device.</p>
        <button onClick={() => location.reload()}>Reload app</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
