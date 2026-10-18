import { restTypeAt } from "../domain/rest";
import {warningLines,zoneLabel} from '../domain/warnings';
import { assessedDay, boundary } from "../domain/timeline";
import { operatingRules } from "../domain/catalogue";
import { useReport } from "../components/useReport";
import { selectWorkWindow, windowTotals } from "../domain/rules";
import { displayCivil } from "../domain/time";
import { useRef, useState } from "react";
import { useStore } from "../context";
import {
  audit,
  clone,
  emptyDay,
  ensureDay,
  type Activity,
  type Change,
  type Day,
  zones,
} from "../domain/model";
import { allocatePage, cancelPage, changes, editRange } from "../domain/diary";
import { hhmm, minutesLabel, totals, dateAdd } from "../domain/time";
import {
  Action,
  Check,
  Empty,
  Field,
  Fold,
  ImageInput,
  Modal,
} from "../components/UI";
import { Location } from "../components/Location";
import { diaryPage, diaryPages } from "../documents/diary-pages";
import { Document } from "../components/Document";
export function Diary({
  date,
  pageId,
  onPage,
  onGuide,
  graph = false,
}: {
  date: string;
  pageId: string;
  onPage: (id: string) => void;
  onGuide: () => void;
  graph?: boolean;
}) {
  const { s, mutate } = useStore(),
    page =
      s.pages.find((p) => p.id === pageId) ||
      s.pages.find((p) => p.date === date && p.status === "Active"),
    readOnly = !!page && page.status !== "Active",
    d = (readOnly ? page?.snapshot : s.days[date]) || emptyDay(s, date);
  const [period, setPeriod] = useState(0),
    [mode] = useState<Activity>("work"),
    [doc, setDoc] = useState(false),
    [allocation, setAllocation] = useState(false),
    [bookId, setBookId] = useState(""),
    [number, setNumber] = useState(""),
    [cancelling, setCancelling] = useState(false),
    [reason, setReason] = useState(""),
    [editingProfile, setEditingProfile] = useState(false),
    [undo, setUndo] = useState<{
      before: Record<string, Day>;
      revisions: Record<string, number>;
    } | null>(null),
    [dragRange, setDragRange] = useState<number[] | null>(null),
    [swipeKind,setSwipeKind] = useState<"work"|"rest"|null>(null),
    [breach, setBreach] = useState<string[] | null>(null);
  const drag = useRef<{
      slot: number;
      kind: Activity;
      end: number;
      x: number;
      y: number;
      row: "work" | "rest";
      axis: "pending" | "horizontal" | "vertical";
    } | null>(null),
    suppressClick = useRef(false);
  const full = s.settings.fullDay,
    visible = full ? [0, 1, 2, 3] : [period],
    allChanges = changes(d);
  const restWorkspace = readOnly ? { ...s, days: { ...s.days, [date]: d } } : s;
  // Assess only elapsed time; do not show projected work or projected breaches.
  const { report, error, retry } = useReport(date + "T24:00", 2, false);
  const daySummary = readOnly ? undefined : report?.days.find(x => x.date === date);
  const t = readOnly ? totals(d.slots) : daySummary;
  const viewDay = readOnly ? d : assessedDay(d,daySummary);
  const countedWindow = !readOnly && report ? selectWorkWindow(report.workWindows,date) || null : null;
  const windowSummary = countedWindow ? windowTotals(s,countedWindow) : null;
  const redSlots = readOnly ? {} : report?.breachSlots || {};
  const dayBreaches = Object.entries(redSlots).filter(([key]) => key.startsWith(date + ":"));
  const warnings = readOnly || !report ? [] : warningLines(report,date);
  async function updateDay(fn: (d: Day) => void, label = "Edit diary") {
    setUndo(null);
    if (readOnly)
      throw Error("This paper page is retained as a historical copy.");
    await mutate((w) => {
      const day = ensureDay(w, date),
        before = clone(day);
      fn(day);
      day.revision++;
      audit(w, label, date, before, day);
    });
  }
  async function blocks(
    a: number,
    b: number,
    kind = mode,
    next = false,
    stationary = false,
  ) {
    if (readOnly) throw Error("This page is read only.");
    const snapshot: Record<string, Day> = {},
      revisions: Record<string, number> = {};
    await mutate((w) => {
      const keys = [date, ...(next && b > 0 ? [dateAdd(date, 1)] : [])];
      for (const key of keys) snapshot[key] = clone(ensureDay(w, key));
      editRange(w, date, a, b, kind, next);
      if (stationary) {
        const d = ensureDay(w, date);
        for (const change of Object.values(d.changes))
          if (change.slot >= a && change.slot < b)
            change.restType = "stationary";
        d.changes[a] = {
          ...(d.changes[a] || {
            slot: a,
            location: "",
            odometer: "",
            note: "",
            vehicle: d.vehicle,
          }),
          restType: "stationary",
        };
      }
      for (const key of keys) revisions[key] = w.days[key].revision;
      if (w.settings.autoPages)
        for (const key of keys)
          if (!w.pages.some((p) => p.date === key && p.status === "Active")) {
            const book = w.books
              .filter((b) => !b.closed && b.firstDate <= key)
              .at(-1);
            if (book) allocatePage(w, key, book.id);
          }
    });
    setUndo({ before: snapshot, revisions });
  }
  async function undoBlocks() {
    if (!undo) return;
    await mutate((w) => {
      for (const [key, before] of Object.entries(undo.before)) {
        if (w.days[key]?.revision !== undo.revisions[key])
          throw Error(
            "This day changed after the last block edit. Review it before undoing.",
          );
        const old = clone(w.days[key]);
        w.days[key] = { ...clone(before), revision: old.revision + 1 };
        audit(w, "Undo block edit", key, old, w.days[key]);
      }
    });
    setUndo(null);
  }

  function change(c: Change, key: keyof Change, v: string) {
    return updateDay((day) => {
      const effective =
        day.slots[c.slot] === "rest"
          ? { ...c, restType: restTypeAt(restWorkspace, date, c.slot) }
          : c;
      day.changes[c.slot] = { ...(day.changes[c.slot] || effective), [key]: v };
    }, "Edit work/rest change");
  }
  const summary = (
    <div className="diary-totals">
      {" "}
      <div className="row totals" aria-label="Page totals">
        <strong>Page</strong>
        <span>
          <i className="dot work" />
          Work <b>{t?minutesLabel(t.work):"…"}</b>
        </span>
        <span>
          <i className="dot rest" />
          Rest <b>{t?minutesLabel(t.rest):"…"}</b>
        </span>
</div>
      {error ? <div className="banner row"><span>{error}</span><Action onClick={retry}>Retry</Action></div> :
        daySummary && <p className="small assessment">Counted through {displayCivil(daySummary.through)} · {d.profile.base} time</p>}
      {warnings.length>0&&<div className="short-warnings" role="status">{warnings.map(x=><p key={x} className={x.startsWith('Review:')?'warning-review':'bad'}>{x}</p>)}</div>}
      <details className="window-summary" aria-label="Work window totals">
        <summary>
          <strong>
            24h window
            {windowSummary?.review || dayBreaches.length || warnings.length ? " · Review" : ""}
          </strong>
          <span>
            {windowSummary
              ? `Work ${minutesLabel(windowSummary.work)} · Rest ${minutesLabel(windowSummary.rest)}`
              : "Needs history / review"}
          </span>
        </summary>
        <div className="window-details">
          <div className="row wrap">
            <strong>Limiting 24-hour window on this page</strong>
            <span className="small">{zoneLabel(countedWindow?.zone||d.profile.zone)} time</span>
          </div>
          {countedWindow && windowSummary ? (
            <>
              <p className="small">
                {displayCivil(countedWindow.start)} →{" "}
                {displayCivil(countedWindow.end)}
              </p>
              <div className="row wrap">
                <span>
                  Work <b>{minutesLabel(windowSummary.work)}</b>
                </span>
                <span>
                  Rest <b>{minutesLabel(windowSummary.rest)}</b>
                </span>
                {windowSummary.unknown > 0 && (
                  <span className="muted">
                    Earlier records to review: {minutesLabel(windowSummary.unknown)}
                  </span>
                )}
              </div>
              <p className="small">{countedWindow.status}{countedWindow.review?" · Check records":""}</p>
              {countedWindow.limit !== null && (
                <p
                  className={
                    windowSummary.work > countedWindow.limit
                      ? "small bad"
                      : "small"
                  }
                >
                  {windowSummary.work > countedWindow.limit
                    ? "Over work cap: "
                    : "Unused work cap in this period: "}
                  {minutesLabel(
                    Math.abs(countedWindow.limit - windowSummary.work),
                  )}
                  {windowSummary.review ? " · start / records need review" : ""}
                </p>
              )}
              <details>
                <summary>Other overlapping 24-hour windows</summary>
                {report?.workWindows
                  .filter(
                    (w) =>
                      w !== countedWindow &&
                      w.start.slice(0, 10) <= date &&
                      w.end > date + " 00:00",
                  )
                  .map((w) => (
                    <p className="small" key={w.start}>
                      {displayCivil(w.start)} → {displayCivil(w.end)} · Work{" "}
                      {minutesLabel(w.work)} · {w.status}
                    </p>
                  ))}
              </details>
            </>
          ) : (
            <p className="small">
              {readOnly
                ? "Historical page copy · work-window totals use the current diary records."
                : report
                  ? "Window needs qualifying rest history / rule review."
                  : "Calculating…"}
            </p>
          )}
          {dayBreaches.length > 0 && (
            <Action
              danger
              onClick={() =>
                setBreach([
                  ...new Set(dayBreaches.flatMap(([, reasons]) => reasons)),
                ])
              }
            >
              {dayBreaches.length} red work{" "}
              {dayBreaches.length === 1 ? "block" : "blocks"} · Review
            </Action>
          )}
        </div>
      </details>
      <Action onClick={onGuide}>How hours are counted</Action>
    </div>
  );
  return (
    <>
      {graph && summary}
      {breach && (
        <Modal
          title="Hours warning"
          onClose={() => setBreach(null)}
        >
          {breach.map((reason, i) => (
            <p key={i}>{displayCivil(reason)}</p>
          ))}
        </Modal>
      )}
      {readOnly && (
        <p className="banner">
          {page!.status} page {page!.number} · {page!.reason}
        </p>
      )}
      {d.review && (
        <div className="banner">
          Imported records need a check.{" "}
          <Action
            onClick={() =>
              updateDay((day) => {
                day.review = false;
              }, "Confirm imported diary")
            }
          >
            Mark reviewed
          </Action>
        </div>
      )}
      {d.clockReview && (
        <p className="banner">
          Clock-change day: check actual elapsed time against the paper record.
        </p>
      )}
      {graph ? (
        <>
          <div className="card graph-card">
            <div className="paper-scroll">
              <div
                className="paper graph"
                dangerouslySetInnerHTML={{
                  __html: diaryPage(
                    viewDay,
                    page,
                    s.books.find((b) => b.id === page?.bookId),
                  ),
                }}
              />
            </div>
          </div>
          <Action disabled={!readOnly&&!daySummary} onClick={() => setDoc(true)}>Preview / export PDF</Action>
          {d.pagePhoto && (
            <Fold title="Compare paper-page photo">
              <img
                src={d.pagePhoto}
                alt="Paper diary page for comparison"
                className="photo"
              />
            </Fold>
          )}
          <div className="card">
            <h2>Work / rest changes</h2>
            {allChanges.map((c) => (
              <div className="record-line" key={c.slot}>
                <strong>{hhmm(c.slot)}</strong>
                <span>
                  {d.slots[c.slot] || "Finish"} · {c.location || "No location"}
                </span>
                <span>{c.odometer}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <section className="card block-card">
            <div className="row wrap block-toolbar">
              <div className="row">
                <strong>Work / Rest</strong>

              </div>
              <div className="row">
                <Action disabled={!undo || readOnly} onClick={undoBlocks}>
                  Undo
                </Action>

              </div>
            </div>
            <div className="periods">
              {[0, 1, 2, 3].map((p) => (
                <button
                  key={p}
                  aria-pressed={!full && period === p}
                  onClick={() => {
                    setPeriod(p);
                    void mutate((w) => {
                      w.settings.fullDay = false;
                    });
                  }}
                >
                  {String(p * 6).padStart(2, "0")}–
                  {String((p + 1) * 6).padStart(2, "0")}
                </button>
              ))}
              <Action
                onClick={() =>
                  mutate((w) => {
                    w.settings.fullDay = !w.settings.fullDay;
                  })
                }
              >
                {full ? "Compact" : "Full day"}
              </Action>
            </div>
            {visible.map((p) => (
              <div key={p} className="six-hours diary-grid-section swipe-grid">
                <div className="swipe-hour-labels">
                  {Array.from({length:6},(_,i)=><span key={i}>{String(p*6+i).padStart(2,"0")}</span>)}
                </div>
                <div className="swipe-blocks" role="group" aria-label={`Work and rest, hours ${p*6} to ${(p+1)*6}`}>
                  {d.slots.slice(p*24,p*24+24).map((activity,i)=>{
                    const slot=p*24+i;
                    const inDrag=dragRange&&slot>=Math.min(...dragRange)&&slot<=Math.max(...dragRange);
                    const kind=inDrag&&swipeKind?swipeKind:activity==="work"?"work":"rest";
                    const reasons=kind==="work"?redSlots[date+":"+slot]:undefined;
                    return <button key={slot} type="button" data-slot={slot} className={`swipe-block ${kind} ${i%4===3?"hour-end":""} ${reasons?.length?"breach":""}`}
                      disabled={readOnly} aria-pressed={kind==="work"}
                      aria-label={`${hhmm(slot)} to ${hhmm(slot+1)}, ${kind}`}
                      title={`${hhmm(slot)}–${hhmm(slot+1)} ${kind}${reasons?.length?" · "+reasons.join(" · "):""}`}
                      onPointerDown={e=>{
                        if(readOnly||e.pointerType==="mouse"&&e.button!==0)return;
                        e.preventDefault();
                        const next=activity==="work"?"rest":"work";
                        drag.current={slot,end:slot,kind:next,row:"work",axis:"horizontal",x:e.clientX,y:e.clientY};
                        setSwipeKind(next);setDragRange([slot,slot]);
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={e=>{
                        const state=drag.current;if(!state)return;
                        const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-slot]");
                        if(!hit)return;
                        const next=Number(hit.getAttribute("data-slot"));
                        if(Number.isInteger(next)&&next>=0&&next<96&&next!==state.end){
                          state.end=next;setDragRange([state.slot,next]);
                        }
                      }}
                      onPointerUp={()=>{
                        const state=drag.current;if(!state)return;
                        drag.current=null;setDragRange(null);setSwipeKind(null);
                        void blocks(Math.min(state.slot,state.end),Math.max(state.slot,state.end)+1,state.kind).catch(()=>{});
                      }}
                      onPointerCancel={()=>{drag.current=null;setDragRange(null);setSwipeKind(null);}}
                      onLostPointerCapture={()=>{if(drag.current){drag.current=null;setDragRange(null);setSwipeKind(null);}}}
                    />;
                  })}
                </div>
              </div>
            ))}
          </section>
          {summary}
          <section className="card">
            <div className="row">
              <h2>Work / rest changes</h2>
              <Action
                onClick={() =>
                  updateDay((day) => {
                    day.changes[96] ||= {
                      slot: 96,
                      location: "",
                      odometer: "",
                      restType: "unknown",
                      note: "",
                      vehicle: day.vehicle,
                    };
                  })
                }
                disabled={readOnly}
              >
                + Finish
              </Action>
            </div>
            {allChanges.length ? (
              <div className="table-scroll">
                <table className="edit-table change-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Odometer</th>
                      <th>Location</th>
                      <th>Work / rest type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allChanges.map((c) => (
                      <tr key={date + ":" + c.slot}>
                        <th scope="row">{hhmm(c.slot)}</th>
                        <td>
                          <Field
                            label="Odometer"
                            value={c.odometer}
                            disabled={readOnly}
                            type="number"
                            min="0"
                            onChange={(v) => {
                              void change(c, "odometer", v).catch(() => {});
                            }}
                          />
                        </td>
                        <td>
                          <Location
                            value={c.location}
                            disabled={readOnly}
                            onChange={(v) => {
                              void change(c, "location", v).catch(() => {});
                            }}
                          />
                        </td>
                        <td>
                          {d.slots[c.slot] === "rest" ? (
                            <>
                              <span className="small">{report?.restClassifications[date+":"+c.slot]
                                ? `${report.restClassifications[date+":"+c.slot].label} · ${minutesLabel(report.restClassifications[date+":"+c.slot].minutes)}`
                                : readOnly ? "Historical rest entry" : "Rest · not yet counted"}</span>
                              <Field
                                label="Rest setting"
                                value={restTypeAt(restWorkspace, date, c.slot)}
                                disabled={readOnly}
                                options={[
                                  ["unknown", "Rest · type not set"],
                                  ["stationary", "Stationary rest"],
                                  ["sleeper-moving", "Sleeper berth · moving"],
                                ]}
                                onChange={(v) => {
                                  void change(c, "restType", v).catch(() => {});
                                }}
                              />
                            </>
                          ) : (
                            <span className="activity-label">
                              {c.slot === 96
                                ? "Finish"
                                : d.slots[c.slot] === "work"
                                  ? "Work"
                                  : "Unrecorded"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Select blocks or enter a time range.</Empty>
            )}
          </section>
          <Fold title="Day details">
            <Field
              label="Rest setting for this page"
              value={d.restDefault || "unknown"}
              disabled={readOnly}
              options={[
                ["unknown", "Confirm each break"],
                ["stationary", "Stationary unless specified"],
                ["sleeper-moving", "Moving sleeper unless specified"],
              ]}
              onChange={(v) => {
                void updateDay((day) => {
                  day.restDefault = v as import("../domain/model").RestType;
                }).catch(() => {});
              }}
            />
            <Check
              label="Fit for duty confirmed for this day"
              value={!!d.fitForDuty}
              disabled={readOnly}
              onChange={(v) => {
                void updateDay((day) => {
                  day.fitForDuty = v;
                }).catch(() => {});
              }}
            />
            <div className="fields">
              <Field
                label="Truck registration"
                value={d.vehicle}
                list="vehicles"
                onChange={(v) => {
                  void updateDay((day) => {
                    day.vehicle = v;
                  }).catch(() => {});
                }}
                disabled={readOnly}
              />
              <Field
                label="Daily check time"
                type="time"
                value={d.dailyCheckTime}
                onChange={(v) => {
                  void updateDay((day) => {
                    day.dailyCheckTime = v;
                  }).catch(() => {});
                }}
                disabled={readOnly}
              />
              <Field
                label="Comments"
                type="textarea"
                wide
                value={d.comments}
                onChange={(v) => {
                  void updateDay((day) => {
                    day.comments = v;
                  }).catch(() => {});
                }}
                disabled={readOnly}
              />
            </div>
            <p className="small">
              {d.profile.name || "Driver not set"} · {d.profile.scheme} ·{" "}
              {d.profile.twoUp ? "Two-up" : "Solo"} · {d.profile.base}
            </p>
            <Action onClick={() => setEditingProfile(true)} disabled={readOnly}>
              Edit this day’s driver / rules
            </Action>
          </Fold>
          <Fold title="Paper page & record copy">
            <div className="row wrap">
              <span>
                {page
                  ? `${s.books.find((b) => b.id === page.bookId)?.number} · Page ${page.number}`
                  : "No paper page allocated"}
              </span>
              <Action
                onClick={() => {
                  setBookId(s.books.find((b) => !b.closed)?.id || "");
                  setAllocation(true);
                }}
              >
                Allocate page
              </Action>
              <Action disabled={!readOnly&&!daySummary} onClick={() => setDoc(true)}>PDF</Action>
              {page?.status === "Active" && (
                <Action danger onClick={() => setCancelling(true)}>
                  Cancel paper page
                </Action>
              )}
            </div>
            <div className="row wrap">
              <ImageInput
                label="Attach paper-page photo"
                onChange={(v) => {
                  void updateDay((day) => {
                    day.pagePhoto = v;
                  }).catch(() => {});
                }}
              />
              <Field
                label="Submitted to record keeper"
                type="date"
                value={d.submittedAt}
                disabled={readOnly}
                onChange={(v) => {
                  void updateDay((day) => {
                    day.submittedAt = v;
                  }).catch(() => {});
                }}
              />
            </div>
            {d.pagePhoto && (
              <a href={d.pagePhoto} target="_blank" rel="noreferrer">
                <img
                  className="photo"
                  src={d.pagePhoto}
                  alt="Attached paper diary page"
                />
              </a>
            )}
          </Fold>
        </>
      )}
      {allocation && (
        <Modal title="Paper page" onClose={() => setAllocation(false)}>
          <Field
            label="Book"
            value={bookId}
            options={s.books
              .filter((b) => !b.closed)
              .map((b) => [b.id, b.number])}
            onChange={setBookId}
          />
          <Field
            label="Page number (blank = next unused)"
            value={number}
            onChange={setNumber}
          />
          <Action
            primary
            onClick={async () => {
              let id = "";
              await mutate((w) => {
                id = allocatePage(w, date, bookId, number || undefined).id;
              });
              onPage(id);
              setAllocation(false);
              setNumber("");
            }}
          >
            Allocate
          </Action>
          {!s.books.some((b) => !b.closed) && (
            <p>Add a diary book in Records first.</p>
          )}
        </Modal>
      )}
      {cancelling && (
        <Modal
          title="Cancel this paper page"
          onClose={() => setCancelling(false)}
        >
          <Field label="Reason" value={reason} onChange={setReason} />
          <p className="small">
            The page is retained with its current contents. Allocate a
            replacement page afterwards.
          </p>
          <Action
            danger
            onClick={async () => {
              await mutate((w) => cancelPage(w, page!.id, reason));
              setCancelling(false);
            }}
          >
            Keep as cancelled page
          </Action>
        </Modal>
      )}
      {editingProfile && (
        <Modal
          title="This day’s driver & rules"
          onClose={() => setEditingProfile(false)}
        >
          <div className="fields">
            <Field
              label="Base state"
              value={d.profile.base}
              options={Object.keys(zones)}
              onChange={(v) => {
                void updateDay((day) => {
                  day.profile.base = v;
                  day.profile.zone = zones[v];
                }).catch(() => {});
              }}
            />
            {[
              ["name", "Driver"],
              ["licence", "Licence"],
              ["coDriver", "Co-driver"],
              ["coLicence", "Co-driver licence"],
              ["certificate", "Accreditation"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={d.profile[k]}
                onChange={(v) => {
                  void updateDay((day) => {
                    day.profile[k] = v;
                  }, "Change day profile").catch(() => {});
                }}
              />
            ))}
            <Field
              label="Operating rules"
              value={operatingRules(d.profile)}
              options={[["HVNL","NHVR / HVNL"],["WA","WA rules"],["NT","NT rules"],["unknown","Not confirmed"]]}
              onChange={(v)=>{void updateDay(day=>{day.profile.operation=v as typeof day.profile.operation;}).catch(()=>{});}}
            />
            <Field
              label="Scheme"
              value={d.profile.scheme}
              options={["Standard", "BFM", "AFM", "ACH"]}
              onChange={(v) => {
                void updateDay((day) => {
                  day.profile.scheme = v as typeof day.profile.scheme;
                }).catch(() => {});
              }}
            />
          </div>
          <Check
            label="Two-up"
            value={d.profile.twoUp}
            onChange={(v) => {
              void updateDay((day) => {
                day.profile.twoUp = v;
              }).catch(() => {});
            }}
          />
          <Action onClick={() => setEditingProfile(false)}>Done</Action>
        </Modal>
      )}
      {doc && (
        <Document
          name={"Diary-" + date + (page ? "-p" + page.number : "")}
          pages={diaryPages(
            viewDay,
            page,
            s.books.find((b) => b.id === page?.bookId),
          )}
          close={() => setDoc(false)}
        />
      )}
    </>
  );
}
