import { analyse } from "./rules";
import { clone } from "./model";
import { finishTimer } from "./diary";
self.onmessage = (e) => {
  const { id, s, asOf, range, now } = e.data;
  try {
    const copy = clone(s);
    if (now && copy.timer) finishTimer(copy, now);
    self.postMessage({ id, report: analyse(copy, asOf, range) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
