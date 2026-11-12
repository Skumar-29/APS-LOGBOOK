import { useEffect, useState } from "react";

/**
 * Map data is deliberately isolated from Workspace and the diary's fatigue
 * calculation engine. It never calls mutate() or writes diary records.
 *
 * The companion is loaded as srcDoc instead of iframe navigation so the
 * existing PWA service worker cannot replace an HTML navigation with the
 * diary shell. The Vite public asset is part of the release's offline cache,
 * although online services and map tiles still require a connection.
 */
export function TruckMap() {
  const [visible, setVisible] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [html, setHtml] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!visible || html) return;
    const abort = new AbortController();
    setLoadError("");
    void fetch(new URL("./aps-drive-map.html", document.baseURI), {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("Map page unavailable (" + response.status + ")");
        const source = await response.text();
        if (!source.includes('id="map"') || !source.includes("Find your journey")) {
          throw Error("Map resource missing or the web app returned its main page.");
        }
        setHtml(source);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Map could not load");
        }
      });
    return () => abort.abort();
  }, [visible, html]);

  useEffect(() => {
    if (!fullScreen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [fullScreen]);

  return (
    <section className="card" aria-label="Truck GPS map and stop finder">
      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>GPS map & truck stops</h2>
          <p className="small" style={{ margin: 0 }}>Start/destination search · GPS · rest areas · fuel</p>
        </div>
        <button className={visible ? "" : "primary"} onClick={() => setVisible(!visible)}>
          {visible ? "Hide map" : "Open GPS map"}
        </button>
      </div>
      <p className="small" style={{ marginBottom: visible ? 10 : 0 }}>
        Built for planning a 26 m B-double journey. Yellow map roads are <strong>not</strong> proof
        of B-double permission. Use the NHVR network planner to validate road access.
      </p>
      {visible && (
        <div
          style={
            fullScreen
              ? {
                  position: "fixed",
                  inset: 0,
                  zIndex: 6000,
                  background: "#f3f6f8",
                  display: "flex",
                  flexDirection: "column",
                  paddingTop: "env(safe-area-inset-top)",
                  paddingBottom: "env(safe-area-inset-bottom)",
                }
              : { width: "100%" }
          }
        >
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 7 }}>
            <span className="small" role="status">
              {html ? "Live location available with GPS permission" : "Loading map…"}
            </span>
            <button onClick={() => setFullScreen(!fullScreen)}>
              {fullScreen ? "Close full screen" : "Full screen"}
            </button>
          </div>
          {loadError && (
            <div className="banner" role="alert">
              {loadError}{" "}
              <button
                onClick={() => {
                  setLoadError("");
                  setHtml("");
                  setVisible(false);
                  window.setTimeout(() => setVisible(true), 0);
                }}
              >
                Retry
              </button>
            </div>
          )}
          {html ? (
            <iframe
              title="APS B-double GPS map and truck stops"
              srcDoc={html}
              allow="geolocation"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{
                display: "block",
                width: "100%",
                height: fullScreen ? "100%" : 820,
                minHeight: fullScreen ? 0 : 500,
                flex: fullScreen ? 1 : undefined,
                border: "1px solid var(--line)",
                borderRadius: fullScreen ? 0 : 10,
                background: "#fff",
              }}
            />
          ) : (
            !loadError && <p className="small">Loading road map and stop finder…</p>
          )}
        </div>
      )}
    </section>
  );
}
