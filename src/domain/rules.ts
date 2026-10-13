import { type DaySummary, type TimelineRun, atBase, buildTimeline, boundary, counted, countRest, countWork, elapsed, incomplete, sameRules, summarizeDay } from "./timeline";
import { type RestClassification } from "./rest";
import { restLabel, nightEvents, hasPair, restEpisodes } from "./qualifications";
import { type Profile, type Workspace, profileOn, ruleProfileAt } from "./model";
import { civil, dateAdd, MINUTE, QUARTER, minutesLabel,instantFor } from "./time";
import { tableFor, operatingRules, type PeriodRule, BFM_84_LIMIT, LONG_NIGHT_LIMIT, RULE_SOURCE, RULE_VERSION } from "./catalogue";
export { RULE_SOURCE, RULE_VERSION } from "./catalogue";

export interface Check {
  label:string; start:string; end:string; work:number; limit:number|null; rest:number; requiredRest:number;
  status:"Exceeded"|"Needs review"|"Within work cap"|"Rest due"|"Open period";
  remaining:number; date:string; reason:string; assessedThrough:string; restSummary?:string;zone?:string;
}
export interface WorkWindow {
  start:string;end:string;limit:number|null;established:boolean;assessedThrough:string;
  zone?:string;work:number;rest:number;remaining:number;status:Check["status"];review:boolean;unknown:number;future:number;
}
export interface Finding {
  id:string;code:string;message:string;severity:"breach"|"review"|"due";
  start:string;end:string;at:string;date:string;zone?:string;instant?:number;
}
export interface RuleReport {
  breachSlots:Record<string,string[]>;restSlots:Record<string,string[]>;workWindows:WorkWindow[];
  checks:Check[];issues:string[];findings:Finding[];days:DaySummary[];
  restClassifications:Record<string,RestClassification>;
  lastWork:string;majorRest:string;nightRests:number;longNight:number;workSince24:number;
  nextBreak:number|null;restartAt:string|null;controlling:Check|null;
  assessedThrough:string;source:string;version:string;revision:number;zone?:string;
  longNightStart?:string;longNightEnd?:string;longNightZone?:string;
}
interface Evaluation {rule:PeriodRule;p:Profile;a:number;b:number;deadline:number;established:boolean;review:boolean;row:Check;}
export function selectCheckSummaries(checks:Check[],cutoff:string,zone:string) {
  const stamp=(s:string,z:string)=>instantFor(s.slice(0,10),s.slice(11,16),z).at(-1)??0;
  const through=stamp(cutoff,zone),groups=new Map<string,Check[]>();
  for(const c of checks){const g=groups.get(c.label)||[];g.push(c);groups.set(c.label,g);}
  const priority={'Exceeded':4,'Rest due':3,'Needs review':2,'Open period':1,'Within work cap':0};
  return [...groups.values()].map(g=>{
    const active=g.filter(c=>stamp(c.end,c.zone||zone)>through);
    if(!active.length)return g.sort((a,b)=>stamp(b.end,b.zone||zone)-stamp(a.end,a.zone||zone))[0];
    return active.sort((a,b)=>priority[b.status]-priority[a.status]||a.remaining-b.remaining||b.start.localeCompare(a.start))[0];
  });
}
const shortMinutes=(n:number)=>n%60===0 ? `${n/60}h` : n<60 ? `${n}m` : `${Math.floor(n/60)}h ${n%60}m`;
const overlap=(r:TimelineRun,a:number,b:number)=>Math.max(0,Math.min(b,r.end)-Math.max(a,r.start))/MINUTE;

function longest(runs:TimelineRun[],a:number,b:number,sleeper=false,possible=false) {
  let best=0,current=0,previous:TimelineRun|null=null;
  for(const r of runs) {
    if(r.end<=a || r.start>=b) continue;
    const eligible=(possible&&r.kind===null || r.kind==="rest" && (r.rest==="stationary" || sleeper&&r.rest==="sleeper-moving" || possible&&r.rest==="unknown")) && (possible || !r.review&&!r.clock);
    if(eligible) {
      current=previous && previous.end===r.start && (previous.rest===r.rest || possible) ? current+overlap(r,a,b) : overlap(r,a,b);
      best=Math.max(best,current);
    } else current=0;
    previous=r;
  }
  return countRest(best);
}
function stationaryChunks(runs:TimelineRun[],a:number,b:number) {
  return restEpisodes(runs).filter(r=>r.rest==="stationary"&&!r.review&&!r.clock).map(r=>countRest(overlap(r,a,b))).filter(Boolean);
}
const compatibleOptions=(a:Profile,b:Profile)=>a.id===b.id&&a.twoUp===b.twoUp&&operatingRules(a)===operatingRules(b)
  && [a.scheme,b.scheme].every(s=>s==="Standard"||s==="BFM");
function restMet(runs:TimelineRun[],a:number,b:number,rule:PeriodRule,p:Profile) {
  if(rule.type==="breaks") return counted(runs,a,b,"rest")>=rule.rest;
  if(rule.type==="weekly") {
    const chunks=stationaryChunks(runs,a,b);
    // Reserve one actual 24h block. Only disjoint time can supply the additional 24h.
    return chunks.some(n=>n>=1440) && chunks.reduce((sum,n)=>sum+(n>=420?n:0),0)>=2880;
  }
  if(rule.type==="nights") {
    const nights=nightEvents(runs,a,b,p.zone);
    const two24=p.scheme!=="BFM"||p.twoUp || stationaryChunks(runs,a,b).reduce((n,x)=>n+Math.floor(x/1440),0)>=2;
    return nights.length>=4 && (p.scheme==="BFM"&&p.twoUp || hasPair(nights)) && two24;
  }
  return longest(runs,a,b,rule.type==="stationary-or-sleeper")>=rule.rest;
}
function requiredValue(runs:TimelineRun[],a:number,b:number,rule:PeriodRule) {
  return rule.type==="breaks" ? counted(runs,a,b,"rest") : longest(runs,a,b,rule.type==="stationary-or-sleeper");
}
function restSummary(runs:TimelineRun[],a:number,b:number,rule:PeriodRule,p:Profile) {
  if(rule.type==="nights") {
    const nights=nightEvents(runs,a,b,p.zone),pair=p.scheme!=="BFM"||!p.twoUp;
    const daily=p.scheme==="BFM"&&!p.twoUp ? ` · 24h rests ${stationaryChunks(runs,a,b).reduce((n,x)=>n+Math.floor(x/1440),0)}/2` : "";
    return `Night rests ${nights.length}/4${pair?` · Consecutive pair ${hasPair(nights)?"done":"due"}`:""}${daily}`;
  }
  if(rule.type==="weekly") {
    const chunks=stationaryChunks(runs,a,b),major=chunks.some(n=>n>=1440),extra=chunks.reduce((n,x)=>n+(x>=420?x:0),0)-(major?1440:0);
    return `24h rest ${major?"done":"due"} · Other qualifying rest ${minutesLabel(extra)} / 24h`;
  }
  return `${minutesLabel(requiredValue(runs,a,b,rule))} / ${minutesLabel(rule.rest)}`;
}
function restWarning(rule:PeriodRule,p:Profile,value:number) {
  if(rule.type==="nights") return p.scheme==="BFM"&&!p.twoUp ? "Check two 24h rests and four night rests" : "Four night rests needed";
  if(rule.type==="weekly") return "24h rest plus 24h in 7h blocks needed";
  if(rule.type==="breaks") return `${shortMinutes(Math.max(15,rule.rest-value))} break overdue`;
  return `${shortMinutes(rule.rest)} continuous ${rule.type==="stationary-or-sleeper"?"qualifying":"stationary"} rest needed`;
}
function extend(runs:TimelineRun[],kind:"work"|"rest",start:number,end:number,p:Profile) {
  const copy=runs.map(r=>({...r}));
  if(end<=start) return copy;
  const last=copy.at(-1), physical=kind==="rest" ? "stationary" : "unknown";
  if(last && last.end===start && last.kind===kind && last.rest===physical && !last.review&&!last.clock) last.end=end;
  else copy.push({start,end,kind,rest:physical,profile:p,review:false,clock:false,countStart:last?.kind===kind&&last.end===start?last.countStart:start});
  return copy;
}
interface WorkPacket {start:number;end:number;minutes:number;proven:boolean;night:boolean;}
function workPackets(runs:TimelineRun[],zone:string):WorkPacket[] {
  const groups:Array<{start:number;end:number;parts:TimelineRun[]}>=[];
  for(const r of runs) if(r.kind==="work") {
    const previous=groups.at(-1);
    if(previous?.end===r.start) {previous.end=r.end;previous.parts.push(r);}
    else groups.push({start:r.start,end:r.end,parts:[r]});
  }
  const packets:WorkPacket[]=[];
  for(const g of groups) {
    const own:WorkPacket[]=[];
    for(let start=g.start;start<g.end;start+=QUARTER) {
      const end=Math.min(g.end,start+QUARTER);
      own.push({start,end,minutes:15,night:false,proven:!g.parts.some(r=>r.end>start&&r.start<end&&(r.review||r.clock))});
    }
    // Use the base recorded with each interval, not today's base for all history.
    // Merge overlapping night intervals so a zone change cannot double count them.
    const nightParts:Array<{start:number;end:number}>=[];
    for(const r of g.parts) for(let date=civil(r.start,r.profile.zone).date;date<=civil(r.end,r.profile.zone).date;date=dateAdd(date,1)) {
      const from=Math.max(r.start,boundary(date,0,r.profile.zone)),to=Math.min(r.end,boundary(date,24,r.profile.zone));
      if(to>from)nightParts.push({start:from,end:to});
    }
    const nights:Array<{start:number;end:number}>=[];
    for(const n of nightParts.sort((a,b)=>a.start-b.start)) {
      const last=nights.at(-1);if(last&&n.start<=last.end)last.end=Math.max(last.end,n.end);else nights.push({...n});
    }
    for(const n of nights) {
      const quantity=countWork((n.end-n.start)/MINUTE)/15;
      const portion=(p:WorkPacket)=>Math.max(0,Math.min(p.end,n.end)-Math.max(p.start,n.start));
      own.filter(p=>portion(p)>0).sort((x,y)=>portion(y)-portion(x)||x.start-y.start).slice(0,quantity).forEach(p=>p.night=true);
    }
    packets.push(...own);
  }

  return packets;
}
function longNightPackets(packets:WorkPacket[],anchors:number[]) {
  const selected=new Set<number>();
  packets.forEach((p,i)=>{if(p.night) selected.add(i);});
  for(const a of anchors) {
    let used=0;
    packets.forEach((p,i)=>{if(p.start>=a&&p.start<a+1440*MINUTE) {used+=p.minutes;if(used>720) selected.add(i);}});
  }
  return selected;
}

/** One elapsed-time report for every screen and export. No calendar-midnight reset. */
export function analyse(s:Workspace,asOf:string,range=14,options:{now?:number;liveThrough?:number}={}):RuleReport {
  const t=buildTimeline(s,asOf,options.now,options.liveThrough), {runs,through,profile}=t;
  range=Math.min(28,Math.max(1,Math.floor(range)));
  const displayFrom=through-range*1440*MINUTE, reportDate=t.requestedDate;
  const breachSlots:Record<string,string[]>={},restSlots:Record<string,string[]>={},issues:string[]=[],findings:Finding[]=[],evaluations:Evaluation[]=[],workWindows:WorkWindow[]=[];
  const work=(a:number,b:number)=>counted(runs,a,b,"work"),rest=(a:number,b:number)=>counted(runs,a,b,"rest");
  const provenRuns=runs.filter(r=>r.kind!=="work" || !r.review&&!r.clock);
  const provenWork=(a:number,b:number)=>counted(provenRuns,a,b,"work");
  const mark=(a:number,b:number,message:string,p:Profile,restOnly=false)=>{
    if(operatingRules(p)!=="HVNL") return;
    for(const r of runs) if(r.end>a&&r.start<b&&r.kind===(restOnly?"rest":"work")&&!r.review&&!r.clock&&sameRules(r.profile,p)) {
      const first=Math.max(r.start,a),last=Math.min(r.end,b);
      for(let at=first;at<last;at=Math.min(last,(Math.floor(at/QUARTER)+1)*QUARTER)) {
        const c=civil(at,r.profile.zone),key=c.date+":"+Math.floor(c.slot), target=restOnly?restSlots:breachSlots;
        target[key] ||= [];if(!target[key].includes(message)) target[key].push(message);
      }
    }
  };
  const addFinding=(code:string,message:string,severity:Finding["severity"],a:number,b:number,at:number,p:Profile)=>{
    if(b<=displayFrom) return;
    const id=`${code}:${a}:${b}:${p.scheme}:${p.twoUp}`;
    if(findings.some(f=>f.id===id)) return;
    const stamp=atBase(at,p.zone);
    findings.push({id,code,message,severity,start:atBase(a,p.zone),end:atBase(b,p.zone),at:stamp,date:stamp.slice(0,10),zone:p.zone,instant:at});
  };
  const episodes=restEpisodes(runs);
  const restEnds=episodes.filter(r=>r.end<through&&runs.some(next=>next.start===r.end&&next.kind==="work"));
  const starts=runs.filter((r,i)=>r.kind==="work"&&(i===0||runs[i-1].kind!=="work")
    && (i===0 || runs[i-1].kind!=="rest" || runs[i-1].end-runs[i-1].start>=15*MINUTE)).map(r=>r.start);
  const anchorCache=new Map<string,number[]>();
  const qualifying=(rule:PeriodRule,p:Profile)=>{
    const key=`${p.scheme}:${p.twoUp}:${p.zone}:${rule.minutes}`,cached=anchorCache.get(key);
    if(cached) return cached;
    if(rule.minutes<1440 || p.scheme==="BFM"&&p.twoUp&&rule.minutes===1440) return starts;
    const result=restEnds.filter(r=>{
      if(r.review||r.clock) return false;
      if(rule.minutes===1440) return (r.rest==="stationary" || rule.type==="stationary-or-sleeper"&&r.rest==="sleeper-moving") && countRest((r.end-r.start)/MINUTE)>=rule.rest;
      if(rule.minutes===3120 || rule.minutes===4920) return r.rest==="stationary" && r.end-r.start>=600*MINUTE;
      if(rule.minutes===10080) return r.rest==="stationary"&&r.end-r.start>=1440*MINUTE;
      return r.rest==="stationary"&&(p.scheme==="BFM"&&!p.twoUp&&r.end-r.start>=1440*MINUTE || nightEvents([r],r.start,r.end,p.zone).length>0);
    }).map(r=>r.end);
    anchorCache.set(key,result);return result;
  };
  const anchors=(rule:PeriodRule,p:Profile)=>{
    const qualified=qualifying(rule,p);
    const fallback=starts.filter(a=>!qualified.some(q=>q<=a&&q>a-rule.minutes*MINUTE));
    return [...new Set([...qualified,...fallback])].sort((a,b)=>a-b);
  };
  const phases:Array<{p:Profile;start:number;end:number}>=[];
  for(const r of runs) {
    const last=phases.at(-1);
    if(last && sameRules(last.p,r.profile)) last.end=r.end;
    else phases.push({p:r.profile,start:r.start,end:r.end});
  }
  if(!phases.length) phases.push({p:profile,start:through,end:through});
  else if(!sameRules(phases.at(-1)!.p,profile)) phases.push({p:profile,start:through,end:through});
  let currentReset=-Infinity;
  for(const phase of phases) {
    const p=phase.p;
    if(operatingRules(p)!=="HVNL") continue;
    const index=phases.indexOf(phase), previous=phases[index-1];
    const switched=previous&&compatibleOptions(previous.p,p)&&previous.p.scheme!==p.scheme;
    const reset=switched ? episodes.filter(r=>r.rest==="stationary"&&!r.review&&!r.clock&&Math.min(r.end,phase.start)-r.start>=2880*MINUTE)
      .map(r=>Math.min(r.end,phase.start)).at(-1) ?? -Infinity : -Infinity;
    if(sameRules(p,profile)&&phase.end===through) currentReset=reset;
    for(const rule of tableFor(p)) for(const a of anchors(rule,p)) {
      if(a<reset) continue;
      const deadline=a+rule.minutes*MINUTE,b=Math.min(deadline,phase.end,through);
      const continues=rule.minutes<1440&&runs.at(-1)?.kind==="work"&&(runs.at(-1)?.countStart ?? through)<=a;
      const current=phase.end===through&&sameRules(p,profile);
      if((b<=displayFrom&&!continues) || b<phase.start || a>=through || !runs.some(r=>r.kind==="work"&&r.end>(current?a:Math.max(a,phase.start))&&r.start<b)) continue;
      const preceding=episodes.find(r=>r.end===a),lookback=a-rule.minutes*MINUTE;
      const q=qualifying(rule,p).includes(a);
      const fallback=!!preceding && runs[0]?.start<=lookback && !incomplete(runs,lookback,a)
        && !runs.some(r=>r.end>lookback&&r.start<a&&r.kind==="rest"&&r.rest==="unknown");
      const established=rule.minutes<1440 || q || fallback || p.scheme==="BFM"&&p.twoUp&&rule.minutes===1440&&!!preceding;
      const w=work(a,b),value=requiredValue(runs,a,b,rule),complete=deadline<=b;
      const missing=incomplete(runs,a,b),typesUnknown=rule.minutes>=1440&&rule.rest>0&&runs.some(r=>r.end>a&&r.start<b&&r.kind==="rest"&&r.rest==="unknown");
      const mixed=runs.some(r=>r.end>a&&r.start<b&&r.kind!==null&&!sameRules(r.profile,p)&&!compatibleOptions(r.profile,p));
      const split=p.scheme==="BFM"&&!p.twoUp&&rule.minutes===1440&&value>=360&&value<420&&rest(a,b)>=480;
      const uncertain=!established || missing || mixed || typesUnknown || split;
      let status:Check["status"]="Open period",reason="",at=b;
      if(rule.limit!==null && provenWork(a,b)>rule.limit && established && !mixed) {
        status="Exceeded";
        // Locate the first excess from confirmed work only, never from unconfirmed imports.
        const packets=workPackets(provenRuns,p.zone).filter(x=>x.start>=a&&x.start<b);
        let used=0;for(const packet of packets) {used+=packet.minutes;if(used>rule.limit){at=packet.start;break;}}
        reason=rule.minutes<1440 ? restWarning(rule,p,value) : `${rule.minutes===1440?"24h":rule.label} work limit exceeded`;
        mark(Math.max(at,phase.start),b,reason,p);
        addFinding(`work-${rule.minutes}`,reason,"breach",a,deadline,at,p);
      } else if((rule.minutes===1440 || rule.minutes===10080&&p.scheme==='Standard'&&rule.type==='stationary') && rule.limit!==null && provenWork(a,b)>rule.limit && !mixed) {
        const workRuns=provenRuns.filter(r=>r.kind==="work"&&r.end>a&&r.start<b);
        const first=workRuns[0],last=workRuns.at(-1);
        const couldHaveMajor=first&&last&&rule.rest>0&&longest(runs,Math.max(a,first.start),Math.min(b,last.end),rule.type==="stationary-or-sleeper",true)>=rule.rest;
        if(first&&last&&!couldHaveMajor) {
          // Proven excessive work without an intervening possible major rest must not
          // look clear merely because the legal period's earlier anchor is missing.
          status="Exceeded";reason="Excess work · check earlier records";
          const packets=workPackets(provenRuns,p.zone).filter(x=>x.start>=a&&x.start<b);
          let used=0;for(const packet of packets){used+=packet.minutes;if(used>rule.limit){at=packet.start;break;}}
          mark(Math.max(at,phase.start),b,reason,p);
          addFinding("work-history",reason,"review",a,deadline,at,p);
        } else {status="Needs review";reason="Check earlier records";}
      } else if(uncertain) {
        status="Needs review";reason=split?"Check BFM split rest":mixed?"Check rule change":!established||missing?"Check earlier records":"Confirm rest type";
        if(complete && split) addFinding("split-rest",reason,"review",a,deadline,b,p);
      } else if(complete) {
        status=restMet(runs,a,b,rule,p)?"Within work cap":"Rest due";
        if(status==="Rest due") {
          reason=restWarning(rule,p,value);
          addFinding(`rest-${rule.minutes}`,reason,"breach",a,deadline,deadline-1,p);
          mark(Math.max(a,deadline-QUARTER),deadline,reason,p,true);
        }
      }
      if(complete && !restMet(runs,a,b,rule,p) && !missing) {
        const warning=restWarning(rule,p,value);
        addFinding(`rest-${rule.minutes}`,warning,uncertain?"review":"breach",a,deadline,deadline-1,p);
      }
      const row:Check={label:rule.label,start:atBase(a,p.zone),end:atBase(deadline,p.zone),work:w,limit:rule.limit,rest:value,requiredRest:rule.rest,status,
        remaining:Math.max(0,Math.min(rule.limit===null?Infinity:rule.limit-w,Math.max(0,(deadline-through)/MINUTE-(restMet(runs,a,b,rule,p)?0:rule.rest)))),
        date:civil(a,p.zone).date,reason,assessedThrough:atBase(b,p.zone),zone:p.zone,restSummary:restSummary(runs,a,b,rule,p)};
      evaluations.push({rule,p,a,b,deadline,established,review:uncertain,row});
      if(rule.minutes===1440) workWindows.push({start:row.start,end:row.end,limit:row.limit,established,assessedThrough:row.assessedThrough,zone:p.zone,work:w,rest:rest(a,b),remaining:row.remaining,status,review:uncertain,
        unknown:elapsed(runs,a,b,null),future:Math.max(0,deadline-b)/MINUTE});
    }
  }
  const pendingBreaks:Check[]=[];
  for(const e of evaluations.filter(e=>e.rule.minutes<1440 && ["Exceeded","Rest due"].includes(e.row.status))) {
    const violation=findings.find(f=>f.code===`work-${e.rule.minutes}`&&f.start===e.row.start);
    const first=violation ? workPackets(provenRuns,e.p.zone).find(x=>atBase(x.start,e.p.zone)===violation.at)?.start ?? e.b : e.deadline;
    const recovery=runs.find(r=>r.kind==="rest"&&!r.review&&!r.clock&&r.start>=first&&r.end-r.start>=15*MINUTE);
    mark(first,recovery?.start ?? through,e.row.reason,e.p);
    if(!recovery && sameRules(e.p,profile)) pendingBreaks.push(e.row);
  }
  const checkpoints=episodes.filter(r=>r.rest==="stationary"&&!r.review&&!r.clock&&r.end-r.start>=1440*MINUTE);
  const last24=checkpoints.at(-1),workSince24=work(last24?.end ?? runs[0]?.start ?? through,through);
  const currentBfm=profile.scheme==="BFM"&&!profile.twoUp;
  const bfmProfiles=[...new Map(phases.filter(x=>x.p.scheme==="BFM"&&!x.p.twoUp&&operatingRules(x.p)==="HVNL").map(x=>[x.p.zone,x.p])).values()];
  let longNight=0;
  const longNightTimes=new Set<number>();
  for(const p of bfmProfiles) {
    const packets=workPackets(runs,p.zone),a24=anchors(tableFor(p).find(r=>r.minutes===1440)!,p);
    const selected=longNightPackets(packets,a24);
    const sum=(a:number,b:number,proven=false)=>[...selected].reduce((n,i)=>n+(packets[i].start>=a&&packets[i].start<b&&(!proven||packets[i].proven)?15:0),0);
    for(const i of selected) if(packets[i].start>=through-10080*MINUTE&&packets[i].start<through) longNightTimes.add(packets[i].start);
    for(const phase of phases.filter(x=>sameRules(x.p,p))) for(const a of starts.filter(a=>a+10080*MINUTE>displayFrom)) {
      if(phase.end===through&&a<currentReset) continue;
      const b=Math.min(through,a+10080*MINUTE,phase.end),used=sum(a,b),proof=sum(a,b,true),deadline=a+10080*MINUTE;
      if(b<phase.start || a>=through || !(phase.end===through&&sameRules(p,profile))&&!runs.some(r=>r.kind==="work"&&sameRules(r.profile,p)&&r.start<b&&r.end>Math.max(a,phase.start))) continue;
      let reason="",status:Check["status"]=deadline>through?"Open period":"Within work cap";
      if(proof>LONG_NIGHT_LIMIT) {
        status="Exceeded";reason="36h long/night work exceeded";
        let n=0,first=b;for(const i of [...selected].sort((x,y)=>packets[x].start-packets[y].start)) {const packet=packets[i];if(packet.proven&&packet.start>=a&&packet.start<b){n+=15;if(n>LONG_NIGHT_LIMIT){first=Math.min(first,Math.max(phase.start,packet.start));mark(Math.max(phase.start,packet.start),Math.min(phase.end,packet.end),reason,p);}}}
        addFinding("long-night",reason,"breach",a,deadline,first,p);
      } else if(incomplete(runs,a,b)) status="Needs review";
      const rule:PeriodRule={minutes:10080,limit:LONG_NIGHT_LIMIT,rest:0,type:"breaks",label:"7 days long/night"};
      const row:Check={label:rule.label,start:atBase(a,p.zone),end:atBase(deadline,p.zone),work:used,limit:LONG_NIGHT_LIMIT,rest:0,requiredRest:0,status,remaining:Math.max(0,LONG_NIGHT_LIMIT-used),date:civil(a,p.zone).date,reason,zone:p.zone,assessedThrough:atBase(b,p.zone)};
      evaluations.push({rule,p,a,b,deadline,established:true,review:status==="Needs review",row});
    }
    for(let i=0;i<checkpoints.length;i++) {
      const a=checkpoints[i].end,b=checkpoints[i+1]?.start ?? through;
      if(b<=displayFrom || provenWork(a,b)<=BFM_84_LIMIT) continue;
      let used=0;for(const packet of workPackets(provenRuns,p.zone)) if(packet.start>=a&&packet.start<b) {
        used+=15;if(used>BFM_84_LIMIT&&runs.some(r=>r.kind==="work"&&sameRules(r.profile,p)&&r.start<packet.end&&r.end>packet.start)){mark(packet.start,packet.end,"84 hours work exceeded",p);addFinding("work-84","84 hours work exceeded","breach",a,b,packet.start,p);break;}
      }
      // Preserve every later confirmed work block until the qualifying rest starts.
      const first=findings.find(f=>f.code==="work-84"&&f.start===atBase(a,p.zone));
      if(first) {const matching=workPackets(provenRuns,p.zone).filter(x=>x.start>=a&&x.start<b);let n=0;for(const x of matching){n+=15;if(n>BFM_84_LIMIT) mark(x.start,x.end,"84 hours work exceeded",p);}}
    }
  }
  longNight=longNightTimes.size*15;
  const recent=nightEvents(runs,through-20160*MINUTE,through,profile.zone);
  const cutoffDay=civil(through,profile.zone).date;
  const relevantFrom=Math.max(through-20160*MINUTE,currentReset);
  const missingHistory=incomplete(runs,relevantFrom,through) || !runs.length || runs[0].start>relevantFrom;
  if(missingHistory) issues.push("Check earlier records · incomplete history");
  if(runs.some(r=>r.end>relevantFrom&&r.kind==="rest"&&r.rest==="unknown")) issues.push("Confirm rest type");
  if(runs.some(r=>r.end>relevantFrom&&(r.clock||r.review&&s.days[civil(r.start,r.profile.zone).date]?.clockReview)) || t.clockReview) issues.push("Check clock-change records");
  if(operatingRules(profile)!=="HVNL") issues.push("Check operating rules");
  if(!tableFor(profile).length) issues.push("Check certificate-specific hours");
  if(cutoffDay<"2026-08-01") issues.push("Check historical rules");
  if(profile.scheme==="BFM"&&(!profile.certificate||!profile.certificateExpiry||profile.certificateExpiry<cutoffDay)) issues.push("Check BFM accreditation");
  if(profile.twoUp&&!profile.coDriver) issues.push("Add co-driver details");
  if(currentBfm&&!last24) issues.push("24h rest history missing");
  const lastReset=checkpoints.filter(r=>r.end-r.start>=2880*MINUTE).at(-1)?.end || -Infinity;
  const changed=runs.some(r=>r.end>Math.max(relevantFrom,lastReset)&&r.kind!==null&&!sameRules(r.profile,profile)&&!compatibleOptions(r.profile,profile));
  if(changed) issues.push("Check rule change");

  // Forecast from active periods only. An old resolved breach never blocks every future shift.
  const active=evaluations.filter(e=>e.deadline>through&&e.a<=through&&sameRules(e.p,profile));
  const currentRest=runs.at(-1)?.kind==="rest" ? episodes.at(-1)! : null;
  const currentWork=runs.at(-1)?.kind==="work" ? runs.at(-1)! : null;
  const synthetic:Evaluation[]=[];
  if(!currentWork) for(const rule of tableFor(profile)) {
    // Proposed work creates a new long counting period only after its required major rest.
    const eligible=!!currentRest&&!currentRest.review&&!currentRest.clock&&(
      rule.minutes<1440 || profile.scheme==="BFM"&&profile.twoUp&&rule.minutes===1440 ||
      rule.minutes===1440 && (currentRest.rest==="stationary" || rule.type==="stationary-or-sleeper"&&currentRest.rest==="sleeper-moving") && countRest((through-currentRest.start)/MINUTE)>=rule.rest ||
      [3120,4920].includes(rule.minutes)&&currentRest.rest==="stationary"&&through-currentRest.start>=600*MINUTE ||
      rule.minutes===10080&&currentRest.rest==="stationary"&&through-currentRest.start>=1440*MINUTE ||
      rule.minutes===20160&&currentRest.rest==="stationary"&&(nightEvents([currentRest],currentRest.start,through,profile.zone).length>0 || profile.scheme==="BFM"&&!profile.twoUp&&through-currentRest.start>=1440*MINUTE));
    if(!eligible) continue;
    const row:Check={label:rule.label,start:atBase(through,profile.zone),end:atBase(through+rule.minutes*MINUTE,profile.zone),work:0,limit:rule.limit,rest:0,requiredRest:rule.rest,status:"Open period",remaining:rule.limit??Infinity,date:cutoffDay,reason:"",assessedThrough:atBase(through,profile.zone)};
    synthetic.push({rule,p:profile,a:through,b:through,deadline:through+rule.minutes*MINUTE,established:true,review:false,row});
  }
  const budgets=[...active,...synthetic];
  const unresolvedSplit=evaluations.some(e=>e.row.reason==="Check BFM split rest" && !runs.some(r=>r.kind==="rest"&&r.rest==="stationary"&&!r.review&&r.start>=e.b&&r.end-r.start>=420*MINUTE));
  if(unresolvedSplit) issues.push("Check BFM split rest");
  const importantReview=issues.length>0 || active.some(e=>e.review);
  const budgetFor=(e:Evaluation,duration:number)=>{
    const until=through+duration*MINUTE,workEnd=Math.min(until,e.deadline);
    const withWork=extend(runs,"work",through,workEnd,profile);
    if(e.row.label==="7 days long/night") {
      const packets=workPackets(withWork,profile.zone),a24=anchors(tableFor(profile).find(r=>r.minutes===1440)!,profile);
      if(!currentWork) a24.push(through);
      const set=longNightPackets(packets,a24);
      return [...set].reduce((n,i)=>n+(packets[i].start>=e.a&&packets[i].start<e.deadline?15:0),0)<=LONG_NIGHT_LIMIT;
    }
    if(e.rule.limit!==null && counted(withWork,e.a,workEnd,"work")>e.rule.limit) return false;
    const withRest=extend(withWork,"rest",workEnd,e.deadline,profile);
    return restMet(withRest,e.a,e.deadline,e.rule,profile);
  };
  let nextBreak:number|null=null,controlling:Check|null=null,restartAt:string|null=null;
  if(!importantReview && budgets.length && tableFor(profile).length) {
    let best=1440;
    for(const e of budgets) {
      let low=0,high=1441;
      while(low+1<high) {const m=Math.floor((low+high)/2);if(budgetFor(e,m)) low=m;else high=m;}
      if(!budgetFor(e,0)) low=0;
      e.row.remaining=low;
      if(low<best){best=low;controlling=e.row;}
    }
    if(currentBfm&&last24) {
      const remaining=Math.max(0,BFM_84_LIMIT-workSince24);
      if(remaining<best) {best=remaining;controlling={label:"BFM 84-hour work cap",start:atBase(last24.end,profile.zone),end:atBase(through,profile.zone),work:workSince24,limit:BFM_84_LIMIT,rest:0,requiredRest:0,status:"Open period",remaining,date:cutoffDay,reason:"24h stationary rest needed",assessedThrough:atBase(through,profile.zone)};}
    }
    nextBreak=Math.max(0,best);
    if(pendingBreaks.length) {nextBreak=0;controlling=pendingBreaks[0];}
    if(nextBreak===0) {
      let reason="Work limit reached";
      if(controlling) {
        const capReached=controlling.limit!==null&&controlling.work>=controlling.limit;
        if(controlling.label==="BFM 84-hour work cap") reason="24h stationary rest due";
        else if(capReached&&(controlling.requiredRest===0||controlling.rest>=controlling.requiredRest)) reason=`${controlling.label} work limit reached`;
        else if(controlling.requiredRest) reason=controlling.requiredRest>=300 ? `${shortMinutes(controlling.requiredRest)} continuous rest due` : `${shortMinutes(Math.max(15,controlling.requiredRest-controlling.rest))} rest due now`;
      }
      addFinding("rest-now",reason,"due",through,through+MINUTE,through,profile);
    }
  }
  const checks:Check[]=[];
  for(const label of new Set(evaluations.map(e=>e.row.label))) {
    const group=evaluations.filter(e=>e.row.label===label),past=group.filter(e=>["Exceeded","Rest due"].includes(e.row.status));
    checks.push(...past.slice(-5).map(e=>e.row));
    const open=group.filter(e=>e.deadline>through).sort((a,b)=>a.row.remaining-b.row.remaining)[0] || group.at(-1);
    if(open&&!checks.includes(open.row)) checks.push(open.row);
  }
  issues.push(...findings.filter(f=>f.severity!=="due").map(f=>f.message));
  const days:DaySummary[]=[];
  for(let n=range-1;n>=0;n--) {const date=dateAdd(reportDate,-n);days.push(summarizeDay(t,date,s.days[date]?.profile || profileOn(s,date)));}
  const restClassifications:Record<string,RestClassification>={};
  const labels=new Map<string,RestClassification>();
  for(const day of days) for(let slot=0;slot<96;slot++) if(day.slots[slot]==="rest") {
    const at=boundary(day.date,slot,(s.days[day.date]?.profile || profileOn(s,day.date)).zone),r=episodes.find(r=>r.start<=at&&r.end>at);
    if(r) {const p=ruleProfileAt(s,at,s.days[day.date]?.profile||profileOn(s,day.date)),key=`${r.start}:${r.end}:${p.scheme}:${p.twoUp}`;
      if(!labels.has(key)) labels.set(key,restLabel(r.start,r.end,r.rest,p.zone,p));restClassifications[day.date+":"+slot]=labels.get(key)!;}
  }
  const lastWork=runs.filter(r=>r.kind==="work"&&r.end<through).at(-1);
  const majors=runs.filter(r=>r.kind==="rest"&&!r.review&&!r.clock&&(r.rest==="stationary" || profile.twoUp&&profile.scheme==="Standard"&&r.rest==="sleeper-moving")
    &&r.end-r.start>=(profile.twoUp ? profile.scheme==="BFM"?600:300 : 420)*MINUTE);
  const major=majors.at(-1);
  const longCheck=selectCheckSummaries(checks,atBase(through,profile.zone),profile.zone).find(c=>c.label==='7 days long/night');
  if(longCheck) longNight=longCheck.work;
  return {breachSlots,restSlots,workWindows,checks,findings,issues:[...new Set(issues)],days,restClassifications,
    lastWork:lastWork?`${atBase(lastWork.start,lastWork.profile.zone)} — ${atBase(lastWork.end,lastWork.profile.zone)} · ${minutesLabel(countWork((lastWork.end-lastWork.start)/MINUTE))}`:"No completed work established",
    majorRest:major?`${atBase(major.start,major.profile.zone)} · ${minutesLabel(countRest((major.end-major.start)/MINUTE))}`:"Not established",
    nightRests:recent.length,longNight,longNightZone:longCheck?.zone||profile.zone,longNightStart:longCheck?.start||atBase(through-10080*MINUTE,profile.zone),longNightEnd:longCheck?.assessedThrough||atBase(through,profile.zone),workSince24,nextBreak,restartAt,controlling,zone:profile.zone,assessedThrough:atBase(through,profile.zone),source:RULE_SOURCE,version:RULE_VERSION,revision:s.revision};
}

export function windowTotals(_s:Workspace,window:WorkWindow) {
  return {work:window.work,rest:window.rest,unknown:window.unknown,future:window.future,review:window.review};
}
export function selectWorkWindow(windows:WorkWindow[],date:string) {
  return windows.filter(w=>w.start.slice(0,10)<=date&&w.end>date+" 00:00").sort((a,b)=>
    Number(b.status==="Exceeded")-Number(a.status==="Exceeded") || Number(b.status==="Rest due")-Number(a.status==="Rest due")
    || a.remaining-b.remaining || Number(b.established)-Number(a.established) || b.start.localeCompare(a.start))[0];
}
