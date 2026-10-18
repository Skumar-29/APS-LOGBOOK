import { analyse } from "./rules";
self.onmessage = (e) => {
  const { id, s, asOf, range, now } = e.data;
  try {
    const report=analyse(s,asOf,range,{now});
    self.postMessage({id,report});
  }
  catch (error) {
    console.error("Hours calculation failed", error);
    self.postMessage({ id, error: "Hours unavailable · retry" });
  }
};
