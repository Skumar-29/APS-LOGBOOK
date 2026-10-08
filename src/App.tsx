import { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from "react";
import { useStore } from "./context";
import {
  dateAdd,
  today,
  validDate,
  displayInstant,
  displayDate,
} from "./domain/time";
import { findPage } from "./domain/diary";
import { profileOn } from "./domain/model";
import { Action, Field, Modal } from "./components/UI";
import { Diary } from "./screens/Diary";
const Driving = lazy(() =>
  import("./screens/Driving").then((m) => ({ default: m.Driving })),
);
const Stats = lazy(() =>
  import("./screens/Stats").then((m) => ({ default: m.Stats })),
);
const Invoices = lazy(() =>
  import("./screens/Invoices").then((m) => ({ default: m.Invoices })),
);
const Forms = lazy(() =>
  import("./screens/Forms").then((m) => ({ default: m.Forms })),
);
const Documents = lazy(() =>
  import("./screens/Documents").then((m) => ({ default: m.Documents })),
);
const Notes = lazy(() =>
  import("./screens/Notes").then((m) => ({ default: m.Notes })),
);
const Settings = lazy(() =>
  import("./screens/Settings").then((m) => ({ default: m.Settings })),
);
const Records = lazy(() =>
  import("./screens/Records").then((m) => ({ default: m.Records })),
);
type Screen =
  | "Driving"
  | "Diary"
  | "Graph"
  | "Stats"
  | "More"
  | "Invoices"
  | "Forms"
  | "Documents"
  | "Notes"
  | "Records"
  | "Settings";
export default function App() {
  const { s, busy, error, notice, clear, latest, refresh, run } = useStore(),
    [screen, setScreen] = useState<Screen>(s.onboarded ? "Diary" : "Settings"),
    [date, setDate] = useState(today(s.profile.zone)),
    [pageId, setPageId] = useState(""),
    [bookId, setBookId] = useState(s.books.at(-1)?.id || ""),
    [jump, setJump] = useState(false),
    [jumpNumber, setJumpNumber] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine),
    [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const scrollPositions = useRef<Partial<Record<Screen, number>>>({});
  const scrollTarget = useRef(0);
  useLayoutEffect(() => { window.scrollTo({top: scrollTarget.current, behavior: "instant"}); }, [screen]);
  const page =
    s.pages.find((p) => p.id === pageId) ||
    s.pages.find((p) => p.date === date && p.status === "Active");
  const diaryScreen = ["Diary", "Graph", "Stats"].includes(screen);
  const pageProfile = (page?.status !== "Active" ? page?.snapshot?.profile : undefined)
    || s.days[date]?.profile || profileOn(s, date);
  useEffect(() => {
    document.documentElement.dataset.theme = s.settings.theme;
  }, [s.settings.theme]);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("./service-worker.js")
        .then((reg) => {
          if (reg.waiting) setUpdate(reg);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(reg);
            });
          });
        })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  function goDate(d: string) {
    if (!validDate(d)) throw Error("Choose a valid date.");
    setDate(d);
    setPageId("");
    const p = s.pages.find((p) => p.date === d && p.status === "Active");
    if (p) setBookId(p.bookId);
  }
  function goPage(id: string, route = false) {
    const p = s.pages.find((p) => p.id === id);
    if (!p) throw Error("Page not found.");
    setPageId(id);
    setDate(p.date);
    setBookId(p.bookId);
    if (route) { scrollTarget.current = 0; setScreen("Diary"); }
  }
  async function navigate(to: Screen) {
    await latest();
    scrollPositions.current[screen] = window.scrollY;
    scrollTarget.current = to === screen ? 0 : scrollPositions.current[to] || 0;
    if (to === screen) window.scrollTo({top: 0, behavior: "instant"});
    setScreen(to);
  }
  function previous(delta: number) {
    const b = bookId || page?.bookId,
      pages = s.pages
        .filter((p) => p.bookId === b)
        .sort((a, b) => Number(a.number) - Number(b.number)),
      index = pages.findIndex((p) => p.id === page?.id);
    if (index >= 0 && pages[index + delta]) goPage(pages[index + delta].id);
    else goDate(dateAdd(date, delta));
  }
  const reminder =
    s.settings.backupDays > 0 &&
    (!s.settings.lastBackup ||
      Date.now() - Date.parse(s.settings.lastBackup) >
        s.settings.backupDays * 86400000);
  return (
    <div className={"app" + (diaryScreen ? " diary-screen" : "")}>
      <div className="workspace-header">
        <header className="app-header">
          {diaryScreen || screen === "Driving" ?
            <h1>{screen === "Diary" ? "Work diary" : screen === "Graph" ? "Diary graph" : screen === "Stats" ? "Records overview" : "Driving"}</h1> :
            <a href="#" className="brand" onClick={e => {e.preventDefault();run(() => navigate("Diary"));}}>Truck <b>Workspace</b></a>}
          <div className="header-actions">
            <span className="save-state" role="status">{offline ? "Offline" : busy ? "Saving…" : notice ? "Saved" : "On device"}</span>
            {diaryScreen && <button className="header-icon" aria-label="Refresh saved records" disabled={busy} onClick={() => run(refresh)}>↻</button>}
            <Appearance />
          </div>
        </header>
        <BaseClock base={s.profile.base} zone={s.profile.zone} />
          {["Diary", "Graph", "Stats"].includes(screen) && (
            <section className="date-nav">
              <div className="row">
                <button
                  aria-label="Previous recorded page or day"
                  onClick={() => run(() => previous(-1))}
                >
                  ‹
                </button>
                <span className="civil-input">
                  <input
                    lang="en-AU"
                    aria-label="Diary date"
                    type="date"
                    value={date}
                    onChange={(e) => run(() => goDate(e.target.value))}
                  />
                  <span aria-hidden="true">{new Date(date + "T12:00:00Z").toLocaleDateString("en-AU", {weekday:"short",timeZone:"UTC"})} {displayDate(date)}</span>
                </span>
                <button
                  aria-label="Next recorded page or day"
                  onClick={() => run(() => previous(1))}
                >
                  ›
                </button>
                <Action onClick={() => goDate(today(s.profile.zone))}>
                  Today
                </Action>
              </div>
              <div className="row">
                <span className="small">
                  {page
                    ? `${s.books.find((b) => b.id === page.bookId)?.number} · Page ${page.number}`
                    : `${pageProfile.base} · ${pageProfile.scheme}`}
                </span>
                {page && <span className="page-basis">{pageProfile.base} · {pageProfile.scheme}</span>}
                <Action
                  onClick={() => {
                    setBookId(page?.bookId || s.books.at(-1)?.id || "");
                    setJumpNumber("");
                    setJump(true);
                  }}
                >
                  Jump to page
                </Action>
              </div>
            </section>
          )}
      </div>
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button onClick={clear} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {update && (
        <div className="banner row">
          <span>App update ready</span>
          <Action
            onClick={async () => {
              await latest();
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
              update.waiting?.postMessage({ type: "ACTIVATE" });
            }}
          >
            Install update
          </Action>
        </div>
      )}
      {reminder && (
        <div className="backup-reminder">
          <Action onClick={() => navigate("Records")}>
            Backup reminder · Export your records
          </Action>
        </div>
      )}
      <main>
        <Suspense fallback={<p role="status">Opening…</p>}>
          {screen === "Driving" && (
            <Driving
              onDiary={() => {
                goDate(today(s.profile.zone));
                scrollTarget.current = 0;
                setScreen("Diary");
              }}
            />
          )}
          {screen === "Diary" && (
            <Diary
              key={date + pageId}
              date={date}
              pageId={pageId}
              onPage={setPageId}
            />
          )}{" "}
          {screen === "Graph" && (
            <Diary
              key={date + pageId}
              date={date}
              pageId={pageId}
              onPage={setPageId}
              graph
            />
          )}
          {screen === "Stats" && (
            <Stats
              date={date}
              onDate={(d) => {
                goDate(d);
                setScreen("Diary");
              }}
            />
          )}
          {screen === "Invoices" && <Invoices />}
          {screen === "Forms" && <Forms />}
          {screen === "Notes" && <Notes />}
          {screen === "Documents" && <Documents />}
          {screen === "Settings" && (
            <>
              <Settings onDone={() => { run(() => navigate("Diary")); }} />
              {!s.onboarded && (
                <Action onClick={() => navigate("Records")}>
                  Restore an existing backup
                </Action>
              )}
            </>
          )}
          {screen === "Records" && (
            <Records onPage={(id) => goPage(id, true)} />
          )}{" "}
          {screen === "More" && (
            <>
              <h1>Your tools</h1>
              <div className="more-grid">
                {(
                  [
                    ["Invoices", "Trips, rates & PDFs", "↗"],
                    ["Forms", "Safe driving & daily check", "✓"],
                    ["Notes", "Codes, tables & reminders", "≡"],
                    ["Documents", "Certificates, licences & files", "▣"],
                    ["Records", "Books, backup & history", "▤"],
                    ["Settings", "Driver, vehicles & signature", "⚙"],
                  ] as [Screen, string, string][]
                ).map(([title, description, icon]) => (
                  <button
                    key={title}
                    className="card tool-card"
                    aria-label={title + " " + description}
                    onClick={() => run(() => navigate(title))}
                  >
                    <span className="tool-icon">{icon}</span>
                    <span>
                      <b>{title}</b>
                      <small>{description}</small>
                    </span>
                    <span>›</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Suspense>
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {(
          [
            ["Driving", "◉"],
            ["Diary", "▦"],
            ["Graph", "⌁"],
            ["Stats", "▥"],
            ["More", "•••"],
          ] as [Screen, string][]
        ).map(([name, icon]) => (
          <button
            key={name}
            aria-label={name}
            aria-current={
              screen === name ||
              (name === "More" &&
                !["Diary", "Graph", "Stats", "Driving"].includes(screen))
                ? "page"
                : undefined
            }
            onClick={() => run(() => navigate(name))}
          >
            <span aria-hidden="true">{icon}</span>
            {name}
          </button>
        ))}
      </nav>
      <datalist id="vehicles">
        {s.registry
          .filter((r) => r.type === "vehicle")
          .map((r) => (
            <option value={r.name} key={r.id} />
          ))}
      </datalist>
      {jump && (
        <Modal title="Jump to paper page" onClose={() => setJump(false)}>
          <Field
            label="Diary book"
            value={bookId}
            options={s.books.map((b) => [
              b.id,
              b.number + (b.closed ? " · closed" : ""),
            ])}
            onChange={setBookId}
          />
          <Field
            label="Page number"
            value={jumpNumber}
            onChange={setJumpNumber}
          />
          <Action
            primary
            onClick={() => {
              goPage(findPage(s, bookId, jumpNumber).id);
              setJump(false);
            }}
          >
            Go to page
          </Action>
          {!s.books.length && (
            <p>Add or restore your diary books in Records.</p>
          )}
        </Modal>
      )}
    </div>
  );
}

function BaseClock({ base, zone }: { base: string; zone: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="base-clock">
      <span>{base} base time</span>
      <time dateTime={new Date(now).toISOString()}><span className="clock-weekday">{new Intl.DateTimeFormat("en-AU", {weekday:"short",timeZone:zone}).format(now)} · </span>{displayInstant(now, zone)}</time>
    </div>
  );
}

function Appearance() {
  const {s, mutate, run} = useStore();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {if (!panel.current?.contains(e.target as Node)) setOpen(false);};
    const escape = (e: KeyboardEvent) => {if(e.key === "Escape") setOpen(false);};
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", close);document.removeEventListener("keydown", escape);};
  }, [open]);
  return <div className="appearance" ref={panel}>
    <button className="header-icon" aria-label="Appearance" aria-expanded={open} onClick={() => setOpen(v=>!v)}>{s.settings.theme === "dark" ? "☾" : s.settings.theme === "light" ? "☀" : "◐"}</button>
    {open && <div className="appearance-options" role="group" aria-label="Colour mode">
      {([["light","Day mode"],["dark","Night mode"],["system","Use device theme"]] as const).map(([theme,label]) =>
        <button key={theme} aria-pressed={s.settings.theme===theme} onClick={() => run(async()=>{await mutate(w=>{w.settings.theme=theme;});setOpen(false);})}>{label}</button>)}
    </div>}
  </div>;
}
