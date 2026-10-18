import { describe, expect, it, vi } from "vitest";
import { clone, emptyState, ensureDay, type Workspace } from "../src/domain/model";
import { editRange, diaryCsv } from "../src/domain/diary";
import { analyse } from "../src/domain/rules";
import { dateAdd, instantFor } from "../src/domain/time";
import { newForm, allClear, signForm, reviseForm, validateForm } from "../src/domain/forms";
import { newInvoice, blankLoad, validateInvoice } from "../src/domain/invoices";
import { validateState } from "../src/domain/backup";
import { saveRuleChange } from "../src/domain/ruleChanges";

const zone = "Australia/Brisbane";
const stamp = (date:string,time="00:00") => instantFor(date,time,zone)[0];
const signature="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const modes = [
  { name:"Solo Standard", scheme:"Standard", twoUp:false, start:"2026-07-01", hours:8 },
  { name:"Solo BFM", scheme:"BFM", twoUp:false, start:"2026-08-01", hours:10 },
  { name:"Two-up Standard", scheme:"Standard", twoUp:true, start:"2026-09-01", hours:8 },
  { name:"Two-up BFM", scheme:"BFM", twoUp:true, start:"2026-09-01", hours:10 },
] as const;
function fixture(mode: typeof modes[number]) {
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;s.settings.diaryRestDefault="stationary";
  Object.assign(s.profile,{name:"Synthetic driver",licence:"TEST",scheme:mode.scheme,twoUp:mode.twoUp,base:"QLD",zone,certificate:mode.scheme==="BFM"?"TEST":"",certificateExpiry:"2027-12-31",signature});
  for(let n=-28;n<30;n++) ensureDay(s,dateAdd(mode.start,n));
  return s;
}
function duty(s:Workspace,date:string,hours:number) {
  const first=hours===8?16:20, gap=2;
  editRange(s,date,24,24+first,"work");editRange(s,date,24+first+gap,24+2*first+gap,"work");
  const d=s.days[date];
  for(const [slot,location,odo] of [[24,"Laverton North",1000],[24+2*first+gap,"Rocklea",1500]] as const)
    d.changes[slot]={slot,location,odometer:String(odo),vehicle:"TEST01",note:"Synthetic test trip",restType:"stationary"};
}

describe("month-long driver use with independent arithmetic and deliberate mistakes",()=>{
  it.each(modes)("$name: 30 days, corrections, signed forms, weekly invoices and backup", mode=>{
    const s=fixture(mode), expected=new Map<string,number>();let formCount=0;
    for(let n=0;n<30;n++) {
      const date=dateAdd(mode.start,n), working=n%7<5;
      expected.set(date,working?mode.hours*60:0);
      if(working) {
        duty(s,date,mode.hours);
        const f=newForm(s);Object.assign(f.values,{date,depart:"06:00",arrive:date+"T18:00",from:"Laverton North",to:"Rocklea",pm:"TEST01"});
        allClear(f,"checks");allClear(f,"declarations");signForm(f,s);s.forms.push(f);formCount++;
      }
      const cutoff=dateAdd(date,1), r=analyse(s,date+"T24:00",Math.min(n+1,28),{now:stamp(cutoff)});
      const d=r.days.find(x=>x.date===date)!;
      expect(d.work,`${mode.name} ${date} work`).toBe(expected.get(date));
      expect(d.rest,`${mode.name} ${date} rest`).toBe(1440-expected.get(date)!);
      expect(d.unknown).toBe(0);
      expect(r.days.reduce((sum,x)=>sum+x.work,0)).toBe(r.days.reduce((sum,x)=>sum+(expected.get(x.date)||0),0));
      expect(r.findings.filter(x=>x.severity==="breach"),`${mode.name} ${date} unexpected breach`).toEqual([]);
    }
    const last=dateAdd(mode.start,29), end=dateAdd(last,1), cutoff=stamp(end);
    for(let week=0;week<5;week++) {
      const from=dateAdd(mode.start,week*7),to=dateAdd(mode.start,Math.min(29,week*7+6));
      const invoice=newInvoice(s);invoice.billTo="Synthetic Transport";invoice.dateFrom=from;invoice.dateTo=to;invoice.loads=[];
      let jobs=0;
      for(let n=week*7;n<=Math.min(29,week*7+6);n++) if(n%7<5) {
        const row=blankLoad();Object.assign(row,{loadDate:dateAdd(mode.start,n),from:"MEL",to:"BNE",type:"BD",odoStart:"1000",odoFinish:"1500",rate:"0.55"});invoice.loads.push(row);jobs++;
      }
      const checked=validateInvoice(invoice);expect(checked.total).toBe(jobs*275);
      s.invoices.push(checked.invoice);s.invoiceSettings.nextInvoiceNo++;
    }
    expect(s.forms).toHaveLength(formCount);expect(s.invoices).toHaveLength(5);
    const formBefore=clone(s.forms[0]);const correctedId=reviseForm(s,s.forms[0].id);const corrected=s.forms.find(f=>f.id===correctedId)!;
    expect(s.forms[0]).toEqual(formBefore);expect(corrected.signature).toBe("");expect(corrected.status).toBe("Draft");
    const faulty=newForm(s);Object.assign(faulty.values,formBefore.values);allClear(faulty,"checks");allClear(faulty,"declarations");faulty.checks.pm[0]="issue";
    expect(()=>validateForm(faulty)).toThrow("Describe the vehicle fault");
    const badDate=dateAdd(mode.start,14), old=clone(s.days[badDate]);
    editRange(s,badDate,0,60,"work");
    const bad=analyse(s,last+"T24:00",28,{now:cutoff});
    expect(Object.keys(bad.breachSlots).some(k=>k.startsWith(badDate+":"))).toBe(true);
    expect(bad.findings.some(f=>f.severity==="breach"&&f.code==="work-1440")).toBe(true);
    s.days[badDate]=old;
    const good=analyse(s,last+"T24:00",28,{now:cutoff});expect(good.findings.filter(f=>f.severity==="breach")).toEqual([]);
    const restored=JSON.parse(JSON.stringify(s));validateState(restored);
    expect(analyse(restored,last+"T24:00",28,{now:cutoff}).days).toEqual(good.days);
    expect(restored.forms).toEqual(s.forms);expect(restored.invoices).toEqual(s.invoices);
    expect(diaryCsv(restored,dateAdd(mode.start,2),last,good)).toContain('"Daily total"');
  },60000);

  it("does not count a future page or mutate recorded source blocks",()=>{
    const s=fixture(modes[0]);Object.assign(s.profile,{base:"NSW",zone:"Australia/Sydney"});
    editRange(s,"2026-10-15",0,39,"work");const before=clone(s);
    const now=instantFor("2026-10-14","02:38",s.profile.zone)[0];
    const r=analyse(s,"2026-10-15T24:00",1,{now});
    expect(r.days[0]).toMatchObject({date:"2026-10-15",work:0,rest:0,unknown:0});
    expect(r.breachSlots).toEqual({});expect(s).toEqual(before);
    const later=analyse(s,"2026-10-15T09:45",1,{now:instantFor("2026-10-15","09:45",s.profile.zone)[0]});
    expect(later.days[0].work).toBe(585);
    expect(Object.keys(later.breachSlots).length).toBeGreaterThan(0);
  });
  it("new safety form uses the current dated hours option instead of the usual BFM credential",()=>{
    const s=fixture(modes[1]);saveRuleChange(s,stamp("2026-10-14"),stamp("2026-10-15"),{...s.profile,scheme:"Standard",operator:"Other Transport"});
    vi.useFakeTimers({toFake:["Date"]});
    try {
      vi.setSystemTime(stamp("2026-10-14","06:00"));
      const f=newForm(s);expect(f.values.scheme).toBe("Standard");expect(f.values.accreditation).toBe("");
      expect(s.profile.scheme).toBe("BFM");
    } finally {vi.useRealTimers();}
  });
  it.each(modes)("$name: catches accumulated work without inventing a weekly reset",mode=>{
    const s=fixture(mode), from=dateAdd(mode.start,7), count=mode.scheme==="BFM"&&!mode.twoUp?9:7;
    for(let n=0;n<count;n++) {
      const date=dateAdd(from,n);
      for(const [a,b] of [[24,40],[42,58],[60,72]])editRange(s,date,a,b,"work");
    }
    const last=dateAdd(from,count-1),r=analyse(s,last+"T24:00",14,{now:stamp(dateAdd(last,1))});
    const code=mode.scheme==="BFM"&&!mode.twoUp?"work-84":"work-10080";
    expect(r.findings.some(f=>f.code===code&&f.severity==="breach"),`${mode.name}: ${code}`).toBe(true);
  });
  it("BFM detects more than 36 hours of night work over seven days",()=>{
    const s=fixture(modes[1]),from=dateAdd(modes[1].start,7);
    for(let n=0;n<7;n++)editRange(s,dateAdd(from,n),0,24,"work");
    const last=dateAdd(from,6),r=analyse(s,last+"T24:00",14,{now:stamp(dateAdd(last,1))});
    expect(r.findings.some(f=>f.code==="long-night"&&f.severity==="breach")).toBe(true);
  });
});
