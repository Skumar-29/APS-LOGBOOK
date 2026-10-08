import { displayDate, displayInstant } from "../domain/time";
import { useState } from "react";
import { useStore } from "../context";
import { audit, clone, uid } from "../domain/model";
import {
  applyImport,
  exportBackup,
  inspectBackup,
  type ImportPlan,
} from "../domain/backup";
import { encryptBackup, decryptBackup } from "../domain/encryption";
import { dateAdd, today, validDate } from "../domain/time";
import { allocatePage, diaryCsv, normalizePage } from "../domain/diary";
import { recoveryWorkspace } from "../storage";
import {
  Action,
  Check,
  Empty,
  Field,
  Fold,
  Modal,
  download,
  shareFile,
} from "../components/UI";
export function Records({ onPage }: { onPage: (id: string) => void }) {
  const { s, mutate, latest, run } = useStore(),
    [plan, setPlan] = useState<ImportPlan | null>(null),
    [replace, setReplace] = useState(false),
    [pass, setPass] = useState(""),
    [encrypted, setEncrypted] = useState(false),
    [lockedFile, setLockedFile] = useState(""),
    [book, setBook] = useState(false),
    [bookNo, setBookNo] = useState(""),
    [pageNo, setPageNo] = useState("1"),
    [bookDate, setBookDate] = useState(today(s.profile.zone)),
    [from, setFrom] = useState(dateAdd(today(s.profile.zone), -14)),
    [to, setTo] = useState(today(s.profile.zone)),
    [recovery, setRecovery] = useState(false),
    [status, setStatus] = useState(""),
    [pageSearch, setPageSearch] = useState(""),
    [skip, setSkip] = useState(false),
    [skipBook, setSkipBook] = useState(""),
    [skipNumber, setSkipNumber] = useState(""),
    [skipDate, setSkipDate] = useState(today(s.profile.zone)),
    [skipReason, setSkipReason] = useState("");
  async function output(share = false) {
    const current = await latest();
    let text = await exportBackup(current);
    if (encrypted) text = await encryptBackup(text, pass);
    const blob = new Blob([text], { type: "application/json" }),
      name =
        "Truck-Workspace-" +
        today(current.profile.zone) +
        (encrypted ? "-encrypted" : "") +
        ".json";
    if (share) await shareFile(blob, name);
    else download(blob, name);
    await mutate((w) => {
      w.settings.lastBackup = new Date().toISOString();
    });
    setStatus(
      "Backup created. Keep the downloaded file in your chosen backup location.",
    );
    setPass("");
  }
  async function inspect(text: string) {
    if (text.length > 70 * 1024 * 1024)
      throw Error("Choose a backup smaller than 70 MB.");
    if (JSON.parse(text).format === "truck-workspace-encrypted") {
      setLockedFile(text);
      setPass("");
      return;
    }
    setPlan(await inspectBackup(text));
    setReplace(false);
  }
  return (
    <>
      <h1>Records & backups</h1>
      <section className="card">
        <h2>Backup / restore</h2>
        <div className="row wrap">
          <Action primary onClick={() => output()}>
            Download full backup
          </Action>
          <Action onClick={() => output(true)}>Share backup</Action>
          <label className="file-button">
            Restore backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  run(async () => {
                    if (file.size > 70 * 1024 * 1024)
                      throw Error("Backup is too large.");
                    await inspect(await file.text());
                  });
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <Check
          label="Encrypt exported backup"
          value={encrypted}
          onChange={setEncrypted}
        />
        {encrypted && (
          <>
            <Field
              label="Backup passphrase (at least 12 characters)"
              type="password"
              value={pass}
              onChange={setPass}
            />
            <p className="small">
              Keep this passphrase separately. It cannot be recovered.
            </p>
          </>
        )}
        {status && <p role="status">{status}</p>}
        <Fold title="Recover earlier data / same-browser legacy apps">
          <div className="row wrap">
            <Action
              onClick={async () => {
                const text = localStorage.getItem("truckDiaryPWA");
                if (!text)
                  throw Error(
                    "No older diary records were found on this browser origin. Restore your backup file.",
                  );
                await inspect(text);
              }}
            >
              Find older diary data
            </Action>
            <Action
              onClick={async () => {
                const text = localStorage.getItem("aps_invoice_generator_v1");
                if (!text)
                  throw Error(
                    "No older truck invoice data was found on this browser origin. Restore its backup file.",
                  );
                await inspect(text);
              }}
            >
              Find older truck invoices
            </Action>
            <Action onClick={() => setRecovery(true)}>
              Restore pre-import checkpoint
            </Action>
          </div>
        </Fold>
      </section>
      <section className="card">
        <div className="row">
          <h2>Diary books</h2>
          <Action onClick={() => setBook(true)}>+ Book</Action>
        </div>
        {s.books.map((b) => (
          <div className="record-line" key={b.id}>
            <strong>{b.number}</strong>
            <span>
              From {b.firstDate} · p{b.firstPage} ·{" "}
              {b.closed ? "Closed" : "Open"}
            </span>
            <Action
              onClick={() =>
                mutate((w) => {
                  const book = w.books.find((x) => x.id === b.id)!;
                  book.closed = !book.closed;
                  audit(w, book.closed ? "Close book" : "Reopen book", book.id);
                })
              }
            >
              {b.closed ? "Reopen" : "Close"}
            </Action>
          </div>
        ))}
        {!s.books.length && (
          <Empty>
            Add your paper diary book to use automatic page numbering.
          </Empty>
        )}
      </section>
      <Fold title={`Page register · ${s.pages.length} pages`}>
        <Action
          onClick={() => {
            setSkipBook(s.books.find((b) => !b.closed)?.id || "");
            setSkip(true);
          }}
        >
          Record skipped page
        </Action>
        <Field
          label="Find book, page or date"
          value={pageSearch}
          onChange={setPageSearch}
        />
        {[...s.pages]
          .filter((p) =>
            (
              p.date +
              " " +
              p.number +
              " " +
              s.books.find((b) => b.id === p.bookId)?.number
            ).includes(pageSearch),
          )
          .sort(
            (a, b) =>
              b.date.localeCompare(a.date) ||
              Number(b.number) - Number(a.number),
          )
          .slice(0, 250)
          .map((p) => (
            <button
              className="list-button compact"
              key={p.id}
              onClick={() => onPage(p.id)}
            >
              <span>
                {s.books.find((b) => b.id === p.bookId)?.number} ·{" "}
                <b>Page {p.number}</b>
              </span>
              <span>
                {displayDate(p.date)} · {p.status}
              </span>
            </button>
          ))}
      </Fold>
      <Fold title="Exports">
        <div className="fields">
          <Field
            label="From date"
            type="date"
            value={from}
            onChange={setFrom}
          />
          <Field label="To date" type="date" value={to} onChange={setTo} />
        </div>
        <Action
          onClick={() => {
            if (!validDate(from) || !validDate(to) || to < from)
              throw Error("Check the date range.");
            download(
              new Blob(["\ufeff" + diaryCsv(s, from, to)], {
                type: "text/csv;charset=utf-8",
              }),
              "Diary-records-" + from + "-" + to + ".csv",
            );
          }}
        >
          Export records CSV
        </Action>
        <Action
          onClick={() =>
            download(
              new Blob([JSON.stringify(s.audit, null, 2)], {
                type: "application/json",
              }),
              "Truck-Workspace-audit.json",
            )
          }
        >
          Export audit history
        </Action>
      </Fold>
      <Fold title={`Change history · ${s.audit.length} events`}>
        {[...s.audit]
          .reverse()
          .slice(0, 100)
          .map((a) => (
            <div key={a.id} className="record-line">
              <time>{displayInstant(a.at, s.profile.zone)}</time>
              <span>{a.action}</span>
              <small>{a.recordId.length < 30 ? a.recordId : ""}</small>
            </div>
          ))}
      </Fold>
      <Fold title="Original imports">
        {s.imports.map((i) => (
          <div className="record-line" key={i.id}>
            <span>
              {i.source} · {i.at.slice(0, 10)}
            </span>
            <Action
              onClick={() =>
                download(
                  new Blob([JSON.stringify(i.raw, null, 2)], {
                    type: "application/json",
                  }),
                  "Original-import-" + i.at.slice(0, 10) + ".json",
                )
              }
            >
              Download retained source
            </Action>
          </div>
        ))}
      </Fold>
      {plan && (
        <Modal title="Review backup import" onClose={() => setPlan(null)}>
          <p>
            <b>{plan.kind}</b> · {Object.keys(plan.state.days).length} diary
            dates · {plan.state.pages.length} pages ·{" "}
            {plan.state.invoices.length} invoices · {plan.state.forms.length}{" "}
            forms · {plan.state.notes.length} notes ·{" "}
            {plan.state.documents.length} documents
          </p>
          {plan.warnings.map((w, i) => (
            <p className="banner" key={i}>
              {w}
            </p>
          ))}
          <p>
            {Object.keys(plan.state.days).filter((d) => !!s.days[d]).length}{" "}
            dates already exist. Merge keeps current records when dates or IDs
            conflict.
          </p>
          <Check
            label={`Replace current ${plan.kind === "combined" ? "workspace" : plan.kind === "diary" ? "diary records" : "invoices"} with this backup`}
            value={replace}
            onChange={setReplace}
          />
          <p className="small">
            A recovery checkpoint is kept before this import.
          </p>
          <Action
            primary
            onClick={async () => {
              await mutate(
                (current) => applyImport(current, plan, replace),
                true,
              );
              setPlan(null);
              setStatus("Backup imported successfully.");
            }}
          >
            {replace ? "Replace and restore" : "Merge backup"}
          </Action>
        </Modal>
      )}
      {lockedFile && (
        <Modal
          title="Unlock encrypted backup"
          onClose={() => setLockedFile("")}
        >
          <Field
            label="Backup passphrase"
            type="password"
            value={pass}
            onChange={setPass}
          />
          <Action
            primary
            onClick={async () => {
              const text = await decryptBackup(lockedFile, pass);
              const next = await inspectBackup(text);
              setPlan(next);
              setReplace(false);
              setLockedFile("");
              setPass("");
            }}
          >
            Unlock & review
          </Action>
        </Modal>
      )}
      {book && (
        <Modal title="Add paper diary book" onClose={() => setBook(false)}>
          <Field label="Book number" value={bookNo} onChange={setBookNo} />
          <Field
            label="First page number"
            value={pageNo}
            onChange={setPageNo}
          />
          <Field
            label="First date"
            type="date"
            value={bookDate}
            onChange={setBookDate}
          />
          <Action
            primary
            onClick={async () => {
              if (
                !bookNo.trim() ||
                !normalizePage(pageNo) ||
                !validDate(bookDate)
              )
                throw Error(
                  "Enter a book number, numeric first page and start date.",
                );
              await mutate((w) => {
                if (w.books.some((b) => b.number === bookNo.trim()))
                  throw Error("This book is already saved.");
                w.books.push({
                  id: uid(),
                  number: bookNo.trim(),
                  firstDate: bookDate,
                  firstPage: normalizePage(pageNo),
                  closed: false,
                });
              });
              setBook(false);
              setBookNo("");
            }}
          >
            Save book
          </Action>
        </Modal>
      )}
      {skip && (
        <Modal
          title="Record a skipped paper page"
          onClose={() => setSkip(false)}
        >
          <Field
            label="Book"
            value={skipBook}
            options={s.books
              .filter((b) => !b.closed)
              .map((b) => [b.id, b.number])}
            onChange={setSkipBook}
          />
          <Field
            label="Skipped page number"
            value={skipNumber}
            onChange={setSkipNumber}
          />
          <Field
            label="Date"
            type="date"
            value={skipDate}
            onChange={setSkipDate}
          />
          <Field label="Reason" value={skipReason} onChange={setSkipReason} />
          <Action
            primary
            onClick={async () => {
              if (
                !validDate(skipDate) ||
                !normalizePage(skipNumber) ||
                !skipReason.trim()
              )
                throw Error("Enter the page, date and reason.");
              await mutate((w) => {
                if (
                  w.pages.some(
                    (p) =>
                      p.bookId === skipBook &&
                      normalizePage(p.number) === normalizePage(skipNumber),
                  )
                )
                  throw Error("Page number already exists.");
                const p = {
                  id: uid(),
                  bookId: skipBook,
                  number: normalizePage(skipNumber),
                  date: skipDate,
                  status: "Skipped" as const,
                  reason: skipReason,
                };
                w.pages.push(p);
                audit(w, "Skipped paper page", p.id, undefined, p);
              });
              setSkip(false);
            }}
          >
            Save skipped page
          </Action>
        </Modal>
      )}
      {recovery && (
        <Modal
          title="Restore pre-import checkpoint?"
          onClose={() => setRecovery(false)}
        >
          <p>
            This restores the saved workspace from before the most recent
            import. Current records become the new recovery checkpoint.
          </p>
          <Action
            onClick={async () => {
              const old = await recoveryWorkspace();
              if (!old) throw Error("No recovery checkpoint is available.");
              await mutate((w) => {
                if (w.timer)
                  throw Error("Finish the active timer before restoring.");
                const next = clone(old);
                next.revision = w.revision;
                return next;
              }, true);
              setRecovery(false);
            }}
          >
            Restore checkpoint
          </Action>
        </Modal>
      )}
    </>
  );
}
