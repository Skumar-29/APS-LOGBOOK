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
import { hhmm, minutesLabel, parseSlot, totals, dateAdd } from "../domain/time";
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
  graph = false,
}: {
  date: string;
  pageId: string;
  onPage: (id: string) => void;
  graph?: boolean;
}) {
  const { s, mutate } = useStore(),
    page =
      s.pages.find((p) => p.id === pageId) ||
      s.pages.find((p) => p.date === date && p.status === "Active"),
    readOnly = !!page && page.status !== "Active",
    d = (readOnly ? page?.snapshot : s.days[date]) || emptyDay(s, date);
  const [period, setPeriod] = useState(0),
    [mode, setMode] = useState<Activity>("work"),
    [range, setRange] = useState(false),
    [from, setFrom] = useState("00:00"),
    [to, setTo] = useState("06:00"),
    [overnight, setOvernight] = useState(false),
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
    t = totals(d.slots),
    visible = full ? [0, 1, 2, 3] : [period],
    allChanges = changes(d);
  const { report } = useReport(date + "T24:00", 2);
  const countedWindow =
    !readOnly && report && selectWorkWindow(report.workWindows, date);
  const windowSummary = countedWindow ? windowTotals(s, countedWindow) : null;
  const redSlots = readOnly ? {} : report?.breachSlots || {};
  const dayBreaches = Object.entries(redSlots).filter(([key]) =>
    key.startsWith(date + ":"),
  );
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
      day.changes[c.slot] = { ...(day.changes[c.slot] || c), [key]: v };
    }, "Edit work/rest change");
  }
  const summary = <div className="diary-totals">      <div className="row totals" aria-label="Page totals">
        <strong>Page</strong>
        <span>
          <i className="dot work" />
          Work <b>{minutesLabel(t.work)}</b>
        </span>
        <span>
          <i className="dot rest" />
          Rest <b>{minutesLabel(t.rest)}</b>
        </span>
        <span className="muted">Blank {minutesLabel(t.unknown)}</span>
      </div>
      <details className="window-summary" aria-label="Work window totals">
        <summary><strong>24h window{windowSummary?.review || dayBreaches.length ? " · Review" : ""}</strong><span>{windowSummary ? `Work ${minutesLabel(windowSummary.work)} · Rest ${minutesLabel(windowSummary.rest)}` : "Needs history / review"}</span></summary>
        <div className="window-details">
        <div className="row wrap">
          <strong>24-hour work window</strong>
          <span className="small">{d.profile.base} time</span>
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
              <span className="muted">
                Blank {minutesLabel(windowSummary.unknown)}
              </span>
            </div>
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
                  : "Work cap remaining: "}
                {minutesLabel(
                  Math.abs(countedWindow.limit - windowSummary.work),
                )}
                {windowSummary.review ? " · start / records need review" : ""}
              </p>
            )}
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
</div>;
  return (
    <>
      {graph && summary}
      {breach && (
        <Modal
          title="Recorded work limit exceeded"
          onClose={() => setBreach(null)}
        >
          {breach.map((reason, i) => (
            <p key={i}>{displayCivil(reason)}</p>
          ))}
          <p className="small">
            Check the recorded blocks and applicable rules. These highlights are
            a helper, not a compliance clearance.
          </p>
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
                    d,
                    page,
                    s.books.find((b) => b.id === page?.bookId),
                  ),
                }}
              />
            </div>
          </div>
          <Action onClick={() => setDoc(true)}>Preview / export PDF</Action>
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
                <button
                  aria-pressed={mode === null}
                  disabled={readOnly}
                  onClick={() => setMode(mode === null ? "work" : null)}
                >
                  Clear
                </button>
              </div>
              <div className="row">
                <Action disabled={!undo || readOnly} onClick={undoBlocks}>
                  Undo
                </Action>
                <Action onClick={() => setRange(true)} disabled={readOnly}>
                  Time range
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
              <div key={p} className="six-hours diary-grid-section">
                <div className="hour-labels">
                  <span />
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i}>{String(p * 6 + i).padStart(2, "0")}</span>
                  ))}
                </div>
                {(["work", "rest"] as const).map((row) => (
                  <div className="diary-grid-row" key={row}>
                    <strong className="row-label">
                      {row === "work" ? "Work" : "Rest"}
                    </strong>
                    <div
                      className="blocks"
                      role="group"
                      aria-label={`${row === "work" ? "Work" : "Rest"} blocks ${p * 6} to ${(p + 1) * 6}`}
                    >
                      {d.slots.slice(p * 24, p * 24 + 24).map((activity, i) => {
                        const slot = p * 24 + i,
                          reasons =
                            row === "work" && activity === "work"
                              ? redSlots[date + ":" + slot]
                              : undefined;
                        const selected = activity === row;
                        return (
                          <button
                            key={slot}
                            data-slot={slot}
                            data-row={row}
                            className={
                              "block " +
                              (selected ? row : "blank") +
                              (reasons?.length ? " breach" : "") +
                              ((i + 1) % 4 === 0 ? " hour-end" : "") +
                              (dragRange &&
                              drag.current?.kind === row &&
                              slot >= Math.min(...dragRange) &&
                              slot <= Math.max(...dragRange)
                                ? " picking"
                                : "")
                            }
                            disabled={readOnly}
                            aria-pressed={selected}
                            title={`${hhmm(slot)}–${hhmm(slot + 1)} ${row}${reasons?.length ? " · recorded work limit exceeded" : ""}`}
                            aria-label={`${hhmm(slot)} ${row}${reasons?.length ? " · work limit exceeded" : ""}`}
                            onPointerDown={(e) => {
                              if (readOnly) return;
                              suppressClick.current = false;
                              drag.current = {
                                slot, row, axis: "pending",
                                end: slot,
                                kind: mode === null ? null : row,
                                x: e.clientX,
                                y: e.clientY,
                              };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              const a = drag.current;
                              if (!a) return;
                              const dx = Math.abs(e.clientX-a.x), dy = Math.abs(e.clientY-a.y);
                              if (a.axis === "pending" && Math.max(dx,dy) >= 8) a.axis = dy > dx ? "vertical" : "horizontal";
                              if (a.axis !== "horizontal") return;
                              const hit = document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-slot]");
                              if (hit?.getAttribute("data-row") === a.row) {
                                const end = Number(hit.getAttribute("data-slot"));
                                if (Math.floor(end/24) === Math.floor(a.slot/24)) {
                                  a.end = end; setDragRange([a.slot,a.end]);
                                }
                              }
                            }}
                            onPointerCancel={() => {
                              drag.current = null;
                              setDragRange(null);
                              suppressClick.current = true;
                            }}
                            onPointerUp={() => {
                              const a = drag.current;
                              if (a?.axis === "vertical") suppressClick.current = true;
                              if (a?.axis === "horizontal" && a.slot !== a.end) {
                                suppressClick.current = true;
                                void blocks(
                                  Math.min(a.slot, a.end),
                                  Math.max(a.slot, a.end) + 1,
                                  a.kind,
                                ).catch(() => {});
                              }
                              drag.current = null;
                              setDragRange(null);
                            }}
                            onClick={() => {
                              if (suppressClick.current) {
                                suppressClick.current = false;
                                return;
                              }
                              if (reasons?.length && mode !== null) {
                                setBreach(reasons);
                                return;
                              }
                              void blocks(
                                slot,
                                slot + 1,
                                mode === null ? null : row,
                              ).catch(() => {});
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                            <Field
                              label="Rest"
                              value={c.restType}
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
              <Action onClick={() => setDoc(true)}>PDF</Action>
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
      {range && (
        <Modal title="Record a time range" onClose={() => setRange(false)}>
          <div className="fields">
            <Field
              label="From"
              type="time"
              step="900"
              value={from}
              onChange={setFrom}
            />
            <Field
              label="To (24:00 for midnight)"
              value={to}
              onChange={setTo}
            />
          </div>
          <Action
            onClick={async () => {
              await blocks(0, 96, "rest", false, true);
              setRange(false);
            }}
          >
            Full day · stationary rest
          </Action>
          <Check
            label="Finishes on the next day"
            value={overnight}
            onChange={setOvernight}
          />
          <div className="row">
            {(["work", "rest", null] as Activity[]).map((k) => (
              <Action
                key={k || "clear"}
                primary={k === mode}
                onClick={async () => {
                  await blocks(
                    parseSlot(from),
                    to === "24:00" ? 96 : parseSlot(to),
                    k,
                    overnight,
                  );
                  setRange(false);
                }}
              >
                {k === "work"
                  ? "Save work"
                  : k === "rest"
                    ? "Save rest"
                    : "Clear range"}
              </Action>
            ))}
          </div>
        </Modal>
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
            d,
            page,
            s.books.find((b) => b.id === page?.bookId),
          )}
          close={() => setDoc(false)}
        />
      )}
    </>
  );
}
