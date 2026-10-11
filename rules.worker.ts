import { analyse } from "./rules";
self.onmessage = (e) => {
  const { id, s, asOf, range, now } = e.data;
  try { self.postMessage({ id, report: analyse(s, asOf, range, {now}) }); }
  catch (error) {
    console.error("Hours calculation failed", error);
    self.postMessage({ id, error: "Hours unavailable · retry" });
  }
};
