import { analyse } from "./rules";
import { planDiary } from "./planning";
self.onmessage = (e) => {
  const { id, s, asOf, range, now, includePlan } = e.data;
  try {
    const report=analyse(s,asOf,range,{now});
    let plan=null,planError="";
    if(includePlan)try{plan=planDiary(s,asOf.slice(0,10),now ?? Date.now(),report,range);}
    catch {planError="Plan unavailable · retry";}
    self.postMessage({id,report,plan,planError});
  }
  catch (error) {
    console.error("Hours calculation failed", error);
    self.postMessage({ id, error: "Hours unavailable · retry" });
  }
};
