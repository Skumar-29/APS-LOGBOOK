import { displayCivil, displayDate } from "../domain/time";
import { useState } from "react";
import { useStore } from "../context";
import { useReport } from "../components/useReport";
import { dateAdd, minutesLabel } from "../domain/time";
import { diaryCsv } from "../domain/diary";
import { Action, Empty, Field, Fold, download } from "../components/UI";
export function Stats({
  date,
  onDate,
}: {
  date: string;
  onDate: (d: string) => void;
}) {
  const { s } = useStore(),
    [range, setRange] = useState(14),
    [asOf, setAsOf] = useState("24:00"),
    { report, error } = useReport(
      date +
        "T" +
        (/^([01]\d|2[0-3]):[0-5]\d$/.test(asOf) || asOf === "24:00"
          ? asOf
          : "24:00"),
      range,
    );
  if (!report) return <Empty>{error || "Calculating statistics…"}</Empty>;
  const sums = report.days.reduce(
    (a, d) => ({
      work: a.work + d.work,
      rest: a.rest + d.rest,
      unknown: a.unknown + d.unknown,
    }),
    { work: 0, rest: 0, unknown: 0 },
  );
  return (
    <>
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
            <span>Unrecorded</span>
            <strong>{minutesLabel(sums.unknown)}</strong>
          </div>
        </div>
        <div className="stats-bars">
          {report.days.map((d) => (
            <button
              key={d.date}
              className="stat-day"
              onClick={() => onDate(d.date)}
            >
              <span>{displayDate(d.date).slice(0, 5)}</span>
              <span className="stack">
                <i className="work" style={{ width: d.work / 14.4 + "%" }} />
                <i className="rest" style={{ width: d.rest / 14.4 + "%" }} />
              </span>
              <span>{minutesLabel(d.work)}</span>
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
          <span>Grey = unrecorded</span>
        </div>
      </section>
      <section className="card">
        <h2>Rest & night work</h2>
        <div className="record-line">
          <span>Identified night rests · 14 days</span>
          <b>{report.nightRests}</b>
        </div>
        <div className="record-line">
          <span>Long / night work · displayed 7 days</span>
          <b>{minutesLabel(report.longNight)}</b>
        </div>
        <div className="record-line">
          <span>Work since identified 24h rest</span>
          <b>{minutesLabel(report.workSince24)}</b>
        </div>
        <p className="small">{displayCivil(report.majorRest)}</p>
      </section>
      <Fold title="Rule review & history">
        <Field
          label="As of (base time; 24:00 = end of day)"
          value={asOf}
          onChange={setAsOf}
        />
        {report.issues.map((x, i) => (
          <p className="small" key={i}>
            {x}
          </p>
        ))}
        {report.checks.map((c, i) => (
          <div className="period-review" key={i}>
            <div className="row">
              <b>{c.label}</b>
              <span className={c.status === "Exceeded" ? "bad" : ""}>
                {c.status}
              </span>
            </div>
            <p>
              {displayCivil(c.start)} → {displayCivil(c.end)}
            </p>
            <Action onClick={() => onDate(c.date)}>
              Open diary for this period
            </Action>
            <p>
              Work {minutesLabel(c.work)}
              {c.limit !== null ? " / " + minutesLabel(c.limit) : ""} ·
              qualifying rest {minutesLabel(c.rest)}
            </p>
          </div>
        ))}
        <p className="small">
          The helper identifies recorded limits and gaps. It does not certify
          compliance.
        </p>
      </Fold>
      <Action
        onClick={() =>
          download(
            new Blob(["\ufeff" + diaryCsv(s, dateAdd(date, 1 - range), date)], {
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
