import { useEffect, useState } from "react";
import { useStore } from "../context";
import { type RuleReport, RULE_VERSION } from "../domain/rules";
import { type Workspace, profileOn } from "../domain/model";
import { dateAdd, instantFor, MINUTE, QUARTER } from "../domain/time";
const jobs=new Map<string,Promise<{report:RuleReport|null;error:string}>>();
function request(id:string,s:Workspace,asOf:string,range:number,now:number) {
  const existing=jobs.get(id);if(existing) return existing;
  const job=new Promise<{report:RuleReport|null;error:string}>(resolve=>{
    let worker:Worker;
    try {worker=new Worker(new URL("../domain/rules.worker.ts",import.meta.url),{type:"module"});}
    catch {resolve({report:null,error:"Hours unavailable · retry"});return;}
    const finish=(value:{report:RuleReport|null;error:string})=>{clearTimeout(timeout);worker.terminate();resolve(value);};
    const timeout=setTimeout(()=>finish({report:null,error:"Hours unavailable · retry"}),15000);
    worker.onmessage=e=>{if(e.data.id===id) finish({report:e.data.report || null,error:e.data.error || ""});};
    worker.onerror=()=>finish({report:null,error:"Hours unavailable · retry"});
    worker.postMessage({id,s,asOf,range,now});
  });
  jobs.set(id,job);if(jobs.size>12) jobs.delete(jobs.keys().next().value!);
  return job;
}
export function useReport(asOf:string,range=14) {
  const {s}=useStore(),[now,setNow]=useState(Date.now),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;report:RuleReport|null;error:string}|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const date=asOf.slice(0,10),p=s.days[date]?.profile || profileOn(s,date),time=asOf.slice(11,16);
  const requested=time==="24:00" ? instantFor(dateAdd(date,1),"00:00",p.zone)[0] : instantFor(date,time,p.zone).at(-1);
  const through=Math.min(requested || now,now);
  // Recalculate at elapsed-minute and timer rounding boundaries; old pages remain stable.
  const bucket=requested && requested<=now ? through : Math.floor(through/MINUTE);
  const liveBoundary=s.timer && s.timer.start<through ? (s.timer.kind==="work"?Math.ceil((through-s.timer.start)/QUARTER):Math.floor((through-s.timer.start)/QUARTER)) : 0;
  const key=`${s.revision}:${RULE_VERSION}:${asOf}:${range}:${bucket}:${liveBoundary}:${retry}`;
  useEffect(()=>{
    let active=true;
    request(key,s,asOf,range,Date.now()).then(value=>{if(active) setResult({key,...value});});
    return()=>{active=false;};
  },[key,s,asOf,range]);
  const value=result?.key===key ? result : null;
  return {report:value?.report || null,error:value?.error || "",retry:()=>setRetry(n=>n+1)};
}
