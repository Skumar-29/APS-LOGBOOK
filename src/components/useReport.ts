import { useEffect, useState } from "react";
import { useStore } from "../context";
import { type RuleReport } from "../domain/rules";
export function useReport(asOf: string, range = 14, live = false) {
  const { s } = useStore(),
    [report, setReport] = useState<RuleReport | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let done = false;
    setReport(null);
    setError("");
    const worker = new Worker(
      new URL("../domain/rules.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e) => {
      if (!done) {
        setReport(e.data.report || null);
        setError(e.data.error || "");
      }
    };
    worker.onerror = () =>
      setError(
        "Hours summary could not be calculated. Your records are saved.",
      );
    worker.postMessage({
      id: 1,
      s,
      asOf,
      range,
      now: live ? Date.now() : undefined,
    });
    return () => {
      done = true;
      worker.terminate();
    };
  }, [s, asOf, range, live]);
  return { report, error };
}
