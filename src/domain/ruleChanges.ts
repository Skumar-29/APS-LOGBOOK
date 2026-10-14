import { audit, clone, recordProfile, uid, type Profile, type RuleChange, type Workspace } from "./model";
import { dateAdd, instantFor, validDate } from "./time";

export function ruleChangeInstant(local: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(local) || !validDate(local.slice(0,10)))
    throw Error("Choose a valid rule-change time.");
  const times=instantFor(local.slice(0,10),local.slice(11),zone);
  if(times.length!==1) throw Error("Choose an unambiguous base-clock time.");
  return times[0];
}
export function dayRuleRange(date:string,zone:string) {
  return {from:ruleChangeInstant(date+"T00:00",zone),to:ruleChangeInstant(dateAdd(date,1)+"T00:00",zone)};
}
/** A recorded fact, not permission to drive. Assessment may still require history/rest. */
export function saveRuleChange(s:Workspace,from:number,to:number|null,p:Profile,now=Date.now()) {
  if(!Number.isFinite(from) || to!==null&&(!Number.isFinite(to)||to<=from)) throw Error("End must be after the start.");
  if(!["Standard","BFM"].includes(p.scheme)) throw Error("Use the certificate-specific settings for this option.");
  if(p.id!==s.profile.id || p.zone!==s.profile.zone || p.twoUp!==s.profile.twoUp) throw Error("Change only the hours option here.");
  const before=clone(s.ruleChanges||[]), end=to??Infinity;
  const kept:RuleChange[]=[];
  for(const c of before) {
    if(c.driverId!==p.id || (c.to??Infinity)<=from || c.from>=end) {kept.push(c);continue;}
    if(c.from<from) kept.push({...c,to:from});
    if((c.to??Infinity)>end) kept.push({...c,id:uid(),from:end});
  }
  const snapshot=recordProfile(p);
  if(p.scheme==="Standard") {snapshot.certificate="";snapshot.certificateExpiry="";}
  const entry:RuleChange={id:uid(),driverId:p.id,from,to,profile:snapshot,recordedAt:new Date(now).toISOString()};
  s.ruleChanges=[...kept,entry].sort((a,b)=>a.from-b.from);
  audit(s,"Save dated hours option",entry.id,before,clone(s.ruleChanges));
  return entry;
}
export function removeRuleChange(s:Workspace,id:string) {
  const before=clone(s.ruleChanges||[]);
  if(!before.some(c=>c.id===id&&c.driverId===s.profile.id)) throw Error("Hours-option change not found.");
  s.ruleChanges=before.filter(c=>c.id!==id);
  audit(s,"Remove dated hours option",id,before,clone(s.ruleChanges));
}
export function suggestedRestType(s:Workspace,twoUp:boolean) {
  if(!twoUp) return "stationary" as const;
  const last=[...s.activities].reverse().find(t=>t.kind==="rest"&&t.profile.id===s.profile.id&&t.profile.twoUp&&t.restType!=="unknown");
  return last?.restType || "unknown";
}
