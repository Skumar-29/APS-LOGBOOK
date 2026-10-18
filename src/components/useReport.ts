import { useEffect, useState } from "react";
import { useStore } from "../context";
import { type RuleReport, RULE_VERSION } from "../domain/rules";
import type { DiaryPlan } from "../domain/planning";
import { type Workspace, profileOn } from "../domain/model";
import { dateAdd, instantFor, MINUTE, QUARTER } from "../domain/time";
type Result={report:RuleReport|null;plan:DiaryPlan|null;planError:string;error:string};
const jobs=new Map<string,Promise<Result>>();
function request(id:string,s:Workspace,asOf:string,range:number,now:number,liveThrough:number,includePlan:boolean) {
  const existing=jobs.get(id);if(existing) return existing;
  const job=new Promise<Result>(resolve=>{
    let worker:Worker;
    try {worker=new Worker(new URL("../domain/rules.worker.ts",import.meta.url),{type:"module"});}
    catch {resolve({report:null,plan:null,planError:"",error:"Hours unavailable · retry"});return;}
    const finish=(value:Result)=>{clearTimeout(timeout);worker.terminate();resolve(value);};
    const timeout=setTimeout(()=>finish({report:null,plan:null,planError:"",error:"Hours unavailable · retry"}),15000);
    worker.onmessage=e=>{if(e.data.id===id) finish({report:e.data.report || null,plan:e.data.plan || null,planError:e.data.planError || "",error:e.data.error || ""});};
    worker.onerror=()=>finish({report:null,plan:null,planError:"",error:"Hours unavailable · retry"});
    worker.postMessage({id,s,asOf,range,now,liveThrough,includePlan});
  });
  jobs.set(id,job);if(jobs.size>12) jobs.delete(jobs.keys().next().value!);
  return job;
}
/** assessRecorded: review all saved quarter blocks for this diary page, including later entries. */
export function useReport(asOf:string,range=14,includePlan=false,assessRecorded=false) {
  const {s}=useStore(),[now,setNow]=useState(Date.now),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<(Result & {key:string})|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const date=asOf.slice(0,10),p=s.days[date]?.profile || profileOn(s,date),time=asOf.slice(11,16);
  const requested=time==="24:00" ? instantFor(dateAdd(date,1),"00:00",p.zone)[0] : instantFor(date,time,p.zone).at(-1);
  const through=assessRecorded ? requested || now : Math.min(requested || now,now);
  // Saved diary blocks can be checked for the full page without treating a running
  // real-time timer as having continued into the future.
  const liveThrough=Math.min(through,now);
  const bucket=assessRecorded ? (s.timer ? Math.floor(now/MINUTE) : through)
    : requested && requested<=now ? through : Math.floor(through/MINUTE);
  const liveBoundary=s.timer && s.timer.start<liveThrough ? (s.timer.kind==="work"?Math.ceil((liveThrough-s.timer.start)/QUARTER):Math.floor((liveThrough-s.timer.start)/QUARTER)) : 0;
  const key=`${s.revision}:${RULE_VERSION}:${includePlan}:${assessRecorded}:${asOf}:${range}:${bucket}:${liveBoundary}:${retry}`;
  useEffect(()=>{
    let active=true;
    request(key,s,asOf,range,assessRecorded ? through : Date.now(),Date.now(),includePlan).then(value=>{if(active) setResult({key,...value});});
    return()=>{active=false;};
  },[key,s,asOf,range,includePlan,assessRecorded,through]);
  const value=result?.key===key ? result : null;
  return {report:value?.report || null,plan:value?.plan || null,planError:value?.planError || "",now,error:value?.error || "",retry:()=>setRetry(n=>n+1)};
}
