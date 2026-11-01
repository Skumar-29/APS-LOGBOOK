import { displayCivil, displayDate, civil } from "../domain/time";
import { DrivingStatsDashboard } from "./DrivingStatsDashboard";
import {statusClass,warningLines,zoneLabel} from '../domain/warnings';
import { useState } from "react";
import { useStore } from "../context";
import { useReport } from "../components/useReport";
import { dateAdd, minutesLabel } from "../domain/time";
import { diaryCsv } from "../domain/diary";
import { fatigueGuidance } from "../domain/fatigue-guidance";
import { Action, Empty, Field, Fold, download } from "../components/UI";
export function Stats({
  date,
  onDate,
  onSelectDate,
}: {
  date: string;
  onDate: (d: string) => void;
  onSelectDate: (d: string) => void;
}) {
  const { s } = useStore(),
    [range, setRange] = useState(14),
    [asOf, setAsOf] = useState("24:00"),
    { report, error, retry } = useReport(
      date +
        "T" +
        (/^([01]\d|2[0-3]):[0-5]\d$/.test(asOf) || asOf === "24:00"
          ? asOf
          : "24:00"),
      range,
      false,
      true, // Same full recorded-day assessment as Diary; Driving remains elapsed-only.
    );
  if (!report) return <Empty>{error || "Calculating statistics…"}{error&&<Action onClick={retry}>Retry</Action>}</Empty>;
  const sums = report.days.reduce(
    (a, d) => ({
      work: a.work + d.work,
      rest: a.rest + d.rest,
      unknown: a.unknown + d.unknown,
    }),
    { work: 0, rest: 0, unknown: 0 },
  );
  const currentProfile=s.days[date]?.profile||s.profile;
  const fatigue=fatigueGuidance(report,currentProfile);
  return (
    <>
      <DrivingStatsDashboard
        s={s} report={report} p={currentProfile}
        asOf={asOf} onAsOf={setAsOf}
        onNow={()=>{
          const clock=civil(Date.now(),s.profile.zone);
          onSelectDate(clock.date);
          setAsOf(clock.time);
        }}
      />
      <section className="card">
        <div className="row">
          <h2>Statistics</h2>
          <Field
            label="Period"
            value={range}
            options={[
              ["7", "7 days"],
              ["14", "14 days"],
              ["28", "28 days"],
            ]}
            onChange={(v) => setRange(Number(v))}
          />
        </div>
        <div className="metrics">
          <div>
            <span>Work</span>
            <strong>{minutesLabel(sums.work)}</strong>
          </div>
          <div>
            <span>Rest</span>
            <strong>{minutesLabel(sums.rest)}</strong>
          </div>
          <div>
            <span>Remaining Work · 14d</span>
            <strong>{fatigue.work14Remaining===null ? "Review" : minutesLabel(fatigue.work14Remaining)}</strong>
          </div>
        </div>
        <p className="small">The 14-day allowance is a separate rolling limit, not a promise of uninterrupted Work. Shorter limits may require Rest sooner.</p>
        {sums.unknown>0 && <p className="small">Some historical dates were not recorded; confirm those periods before relying on allowances.</p>}
        <p className="small">Calendar pages · {displayDate(report.days[0].date)} → {displayDate(report.days.at(-1)!.date)}</p>
        <p className="small">Counted through {displayCivil(report.assessedThrough)} · {zoneLabel(report.zone)} time</p>
        <div className="stats-bars">
          {report.days.map((d) => (
            <button
              key={d.date}
              className="stat-day"
              onClick={() => onDate(d.date)}
            >
              <span>{displayDate(d.date).slice(0, 5)}</span>
              <span className="stack">
                <i className="work" style={{ width: d.work / Math.max(1440,d.work+d.rest+d.unknown) * 100 + "%" }} />
                <i className="rest" style={{ width: d.rest / Math.max(1440,d.work+d.rest+d.unknown) * 100 + "%" }} />
              </span>
              <span className="daily-hours">W {minutesLabel(d.work)} · R {minutesLabel(d.rest)}</span>
            </button>
          ))}
        </div>
        <div className="row small">
          <span>
            <i className="dot work" />
            Work
          </span>
          <span>
            <i className="dot rest" />
            Rest
          </span>
        </div>
      </section>
      <section className="card">
        <h2>Rest & night work</h2>
        {fatigue.longNightRemaining!==null &&
          <div className="record-line"><span>BFM long/night allowance remaining · 7d</span><b>{minutesLabel(fatigue.longNightRemaining)} / 36h</b></div>}
        <div className="record-line"><span>Qualifying night rests remaining · recent 14d</span><b>{fatigue.nightRestsRemaining} / 4</b></div>
        <div className="record-line"><span>Consecutive-night pair</span><b>{fatigue.pairMet?"Completed":"Not established"}</b></div>
        {fatigue.guidance.map((line,i)=><p className="small" key={i}>{line}</p>)}
        <div className="record-line">
          <span>Identified night rests · 14 days</span>
          <b>{report.nightRests}</b>
        </div>
        <div className="record-line">
          <span>Long / night work · rule window</span>
          <b>{minutesLabel(report.longNight)}</b>
        </div>
        <p className="small">{displayCivil(report.longNightStart||'')} → {displayCivil(report.longNightEnd||'')} · {zoneLabel(report.longNightZone||report.zone)} time</p>
        <div className="record-line">
          <span>Work since identified 24h rest</span>
          <b>{minutesLabel(report.workSince24)}</b>
        </div>
        <p className="small">{displayCivil(report.majorRest)}</p>
      </section>
      <Fold title="Rule review & history">

        {warningLines(report).map((x, i) => (
          <p className="small" key={i}>
            {x}
          </p>
        ))}
        {report.checks.map((c, i) => (
          <div className="period-review" key={i}>
            <div className="row">
              <b>{c.label}</b>
              <span className={'status '+statusClass(c.status)}>
                {c.status}
              </span>
            </div>
            <p>
              {displayCivil(c.start)} → {displayCivil(c.end)} · {zoneLabel(c.zone||report.zone)} time
            </p>
            <Action onClick={() => onDate(c.date)}>
              Open diary for this period
            </Action>
            <p>
              Work {minutesLabel(c.work)}
              {c.limit !== null ? " / " + minutesLabel(c.limit) : ""} ·
              rest {c.restSummary || minutesLabel(c.rest)}
            </p>
          </div>
        ))}
      </Fold>
      <Action
        onClick={() =>
          download(
            new Blob(["\ufeff" + diaryCsv(s, dateAdd(date, 1 - range), date, report)], {
              type: "text/csv;charset=utf-8",
            }),
            "Diary-" + date + ".csv",
          )
        }
      >
        Export period CSV
      </Action>
    </>
  );
}
