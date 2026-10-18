import { useState } from "react";
import { useStore } from "../context";
import { Field, Fold } from "../components/UI";
import { tableFor, restRequirement, RULE_SOURCE, HOURS_SOURCE, DIARY_SOURCE, LAW_SOURCE, REVIEW_DATE, LONG_NIGHT_LIMIT, BFM_84_LIMIT } from "../domain/catalogue";
import { minutesLabel } from "../domain/time";

export function Guide() {
  const {s}=useStore();
  const [scheme,setScheme]=useState<"Standard"|"BFM">(s.profile.scheme==="BFM"?"BFM":"Standard");
  const [two,setTwo]=useState(s.profile.twoUp);
  const profile={scheme,twoUp:two};
  return <>
    <h1>NHVR guide</h1>
    <p className="small">Simple explanations · reviewed {REVIEW_DATE}</p>
    <section className="card">
      <h2>How this app counts</h2>
      <p>Select work blocks. Unselected blocks on a saved day mean rest. A missing day needs records. Future time earns no completed hours.</p>
      <p>All screens use the same timeline, including the running timer. Midnight starts a new diary page; the counting periods keep going.</p>
      <p>Warnings name the problem: “15m break overdue”, “24h work limit exceeded” or “Confirm rest type”.</p>
    </section>
    <Fold title="Work, rest and automatic break labels">
      <p>Work includes driving, loading, unloading, fuelling, vehicle checks and transport paperwork. Rest means time free from work.</p>
      <p>Record the rest setting: stationary, approved moving sleeper, or not confirmed. Stationary means out of the vehicle or in an approved sleeper berth while it is stationary.</p>
      <p>The app labels a recorded break automatically. It needs the correct rest setting to recognise a major rest, night rest or 24h rest.</p>
      <p>A solo major rest needs 7 continuous stationary hours. Work interrupts it. Separate short breaks cannot be added to make 7 continuous hours.</p>
      <p>A night rest is 7 continuous stationary hours within 10pm–8am, or 24 continuous stationary hours. A 20:00–03:00 break has only 5 hours in the night band. A stationary 02:00–02:00 break qualifies through the 24h alternative.</p>
    </Fold>
    <Fold title="Your overnight example" open>
      <p>20:15 on 10 October → 03:00 on 11 October is 6h 45m of continuous work: 3h 45m on the first page and 3h on the second.</p>
      <p>Assuming no other work and the required earlier rest: under Standard hours, a 15m break is due by 01:30. Under BFM solo hours, it is due by 02:15. Continuing work after those times is flagged on the second page.</p>
    </Fold>
    <Fold title="Counting periods and overlapping windows">
      <p>Short periods start at the end of a rest break. For 24h and longer periods, the start depends on the major rest required by that period’s table. The app keeps checking older periods until they finish.</p>
      <p>A new major rest can create another counting period. It does not erase work in an earlier period.</p>
      <p>Example: a Standard solo driver starts at 06:00 and uses all 12 work hours by 19:45, with breaks. After resting 7 hours, it is 02:45. The original 24h period still lasts until 06:00, so work cannot restart at 02:45.</p>
    </Fold>
    <Fold title="15-minute rounding and exact timers">
      <p>This is a written-diary checker: continuous work rounds up to 15 minutes; continuous rest rounds down. A break shorter than 15 minutes gives no minimum-rest credit.</p>
      <p>17 minutes of work counts as 30 minutes. 17 minutes of rest counts as 15 minutes. 57 minutes of rest counts as 45 minutes.</p>
      <p>Timers keep their exact start and end. The blocks show where the activity happened; touching parts of three blocks does not automatically count as 45 minutes.</p>
      <p>A continuous activity crossing midnight is rounded once. Day totals divide that counted time between the pages. Partial work and rest can therefore leave counted totals different from elapsed clock time.</p>
    </Fold>
    <Fold title="Hours tables">
      <div className="fields">
        <Field label="Table" value={scheme} options={["Standard","BFM"]} onChange={v=>setScheme(v as "Standard"|"BFM")} />
        <Field label="Driver arrangement" value={two?"two":"solo"} options={[["solo","Solo"],["two","Two-up"]]} onChange={v=>setTwo(v==="two")} />
      </div>
      <div className="table-scroll"><table className="hours-table">
        <thead><tr><th>Period</th><th>Maximum work</th><th>Minimum rest</th></tr></thead>
        <tbody>{tableFor(profile).map(r=><tr key={r.minutes}><th scope="row">{r.minutes===1440?"24h":r.label}</th><td>{r.limit===null?"No limit set":minutesLabel(r.limit)}</td><td>{restRequirement(r,profile)}</td></tr>)}
          {scheme==="BFM"&&!two&&<tr><th scope="row">7 days</th><td>{minutesLabel(LONG_NIGHT_LIMIT)} long/night work</td><td>No minimum set for this period</td></tr>}
        </tbody>
      </table></div>
      {scheme==="BFM"&&<p className="small">BFM applies only under a valid existing accreditation and its conditions. Since 1 August 2026, eligible operators can retain BFM until expiry, cancellation or transition.</p>}
      <p className="small">Truck tables. Check the official table for your operation.</p>
    </Fold>
    <Fold title="BFM long/night work and the 84h checkpoint">
      <p>For a BFM solo driver, work between midnight and 06:00 counts as night work. Work above 12 hours in a counted 24h period is long work. The same work is counted once when both apply. The 7-day maximum is {minutesLabel(LONG_NIGHT_LIMIT)}.</p>
      <p>A continuous 24h stationary rest is required after no more than {minutesLabel(BFM_84_LIMIT)} of work. The app keeps the last recorded checkpoint even when it is older than 28 days. Missing days do not reset the counter.</p>
      <p>The 14-day BFM solo check also needs two 24h stationary rests and four night rests, including two on consecutive days.</p>
    </Fold>
    <Fold title="Base time, missing records and special rules">
      <p>Keep the clock in your driver’s base time zone when crossing borders. The timer uses elapsed timestamps during a clock change; ambiguous manual clock-change records need review.</p>
      <p>Your base clock and operating rules are separate settings. WA and NT rules are not automatically checked with NHVR tables.</p>
      <p>Missing history or an unconfirmed rest setting shows a short review warning. A confirmed short-period breach can still be shown. Future rest never clears a warning.</p>
      <p>AFM, ACH, exemptions and conditional BFM split rests need their actual certificate or conditions. This version asks for review instead of inventing an allowance. A rules change keeps the old records; the destination rules and reset requirements need checking.</p>
    </Fold>
    <Fold title="Changing between Standard and BFM">
      <p>Save a whole day, a range of days, or an exact start and end in your base time. Previous records keep their original option. All earlier work still counts when checking the new option.</p>
      <p>You may switch only when you meet all applicable work and rest requirements of the destination option, or after the required 48-hour reset rest. A confirmed reset starts the new counting periods from its end. Saving a setting is not permission to drive.</p>
      <p>For a change during a calendar day, use the next daily sheet in your written work diary. PDF previews separate the options and leave additional paper page numbers unallocated.</p>
      <a href="https://www.nhvr.gov.au/files/202010-1174-swapping-between-bfm-and-standard-hours.pdf" target="_blank" rel="noreferrer">NHVR swapping fact sheet ↗</a>
    </Fold>
    <section className="card">
      <h2>Official guidance</h2>
      <div className="guide-links">
        {[[RULE_SOURCE,"NHVR counting time"],[HOURS_SOURCE,"NHVR work and rest hours"],[DIARY_SOURCE,"NHVR work diary and PDF guide"],[LAW_SOURCE,"Fatigue Management National Regulation"]].map(([url,label])=><a key={url} href={url} target="_blank" rel="noreferrer">{label} ↗</a>)}
      </div>
      <p className="small">This app is a personal checker, not an NHVR-approved electronic work diary. Keep the written diary or approved EWD required for your operation. An hours result does not establish fitness to drive.</p>
    </section>
  </>;
}
