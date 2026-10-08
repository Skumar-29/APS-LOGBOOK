import { useEffect, useState } from "react";
import { useStore } from "../context";
import { audit, type SavedDocument } from "../domain/model";
import {
  documentBlob,
  documentCategories,
  makeDocument,
  MAX_DOCUMENT_TOTAL,
} from "../domain/documents";
import { readDocumentData } from "../storage";
import { displayDate, today } from "../domain/time";
import {
  Action,
  Check,
  Empty,
  Field,
  Modal,
  download,
  shareFile,
} from "../components/UI";

export function Documents() {
  const { s, mutate, run } = useStore();
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<SavedDocument | null>(null);
  const [shown, setShown] = useState<{
      document: SavedDocument;
      blob: Blob;
    } | null>(null),
    [remove, setRemove] = useState<SavedDocument | null>(null);
  const total = s.documents.reduce((n, d) => n + d.size, 0);
  async function upload(file: File) {
    const d = await makeDocument(file);
    if (s.documents.some((x) => x.hash === d.hash))
      throw Error("This file is already in Documents.");
    setEdit(d);
  }
  async function save() {
    if (!edit?.title.trim()) throw Error("Enter a document name.");
    await mutate((w) => {
      const index = w.documents.findIndex((d) => d.id === edit.id);
      const record = { ...edit, title: edit.title.trim() };
      if (index < 0) {
        if (w.documents.some((d) => d.hash === record.hash))
          throw Error("This file is already in Documents.");
        w.documents.push(record);
      } else w.documents[index] = record;
      audit(
        w,
        index < 0 ? "Add document" : "Edit document details",
        record.id,
        undefined,
        {
          title: record.title,
          category: record.category,
          expiry: record.expiry,
        },
      );
    });
    setEdit(null);
  }
  async function show(d: SavedDocument) {
    const data = await readDocumentData(d.hash);
    setShown({ document: d, blob: documentBlob(data, d.mime) });
  }
  return (
    <>
      <div className="row">
        <h1>Documents</h1>
        <label className="file-button">
          + Add document
          <input
            type="file"
            aria-label="Add document"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) run(() => upload(file));
            }}
          />
        </label>
      </div>
      <Field label="Search documents" value={search} onChange={setSearch} />
      <p className="small">
        Saved offline · {(total / 1048576).toFixed(1)} /{" "}
        {MAX_DOCUMENT_TOTAL / 1048576} MB · Files are included in full backups.
      </p>
      {s.documents
        .filter((d) =>
          (d.title + " " + d.category)
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            a.title.localeCompare(b.title),
        )
        .map((d) => (
          <section className="card document-card" key={d.id}>
            <div className="row">
              <div>
                <h2>
                  {d.pinned ? "★ " : ""}
                  {d.title}
                </h2>
                <span className="small">
                  {d.category} · {(d.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <Action primary onClick={() => show(d)}>
                Show document
              </Action>
            </div>
            {d.expiry && (
              <p
                className={
                  d.expiry < today(s.profile.zone) ? "bad small" : "small"
                }
              >
                {d.expiry < today(s.profile.zone) ? "Expired" : "Expires"}{" "}
                {displayDate(d.expiry)}
              </p>
            )}
            <div className="row document-actions">
              <Action onClick={() => setEdit({ ...d })}>Edit details</Action>
              <Action
                onClick={() =>
                  mutate((w) => {
                    const item = w.documents.find((x) => x.id === d.id)!;
                    item.pinned = !item.pinned;
                  })
                }
              >
                {d.pinned ? "Unpin" : "Pin"}
              </Action>
              <Action danger onClick={() => setRemove(d)}>
                Delete
              </Action>
            </div>
          </section>
        ))}
      {!s.documents.length && (
        <Empty>
          Keep certificates, police checks and licences ready to show offline.
        </Empty>
      )}
      {edit && (
        <Modal
          title={edit.data ? "Save document" : "Document details"}
          onClose={() => setEdit(null)}
        >
          <Field
            label="Document name"
            value={edit.title}
            onChange={(title) => setEdit({ ...edit, title })}
          />
          <Field
            label="Document type"
            value={edit.category}
            options={documentCategories}
            onChange={(category) => setEdit({ ...edit, category })}
          />
          <Field
            label="Expiry date (optional)"
            type="date"
            value={edit.expiry}
            onChange={(expiry) => setEdit({ ...edit, expiry })}
          />
          <Check
            label="Pin for quick access"
            value={edit.pinned}
            onChange={(pinned) => setEdit({ ...edit, pinned })}
          />
          <Action primary onClick={save}>
            Save document
          </Action>
        </Modal>
      )}
      {shown && (
        <DocumentViewer
          document={shown.document}
          blob={shown.blob}
          onClose={() => setShown(null)}
        />
      )}
      {remove && (
        <Modal title="Delete document?" onClose={() => setRemove(null)}>
          <p>Remove {remove.title} from your documents?</p>
          <Action
            danger
            onClick={async () => {
              await mutate((w) => {
                w.documents = w.documents.filter((d) => d.id !== remove.id);
                audit(w, "Delete document", remove.id, { title: remove.title });
              }, true);
              setRemove(null);
            }}
          >
            Delete document
          </Action>
        </Modal>
      )}
    </>
  );
}
function DocumentViewer({
  document: d,
  blob,
  onClose,
}: {
  document: SavedDocument;
  blob: Blob;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return (
    <Modal title={d.title} onClose={onClose}>
      <div className="document-viewer">
        <div className="row wrap">
          <Action onClick={() => shareFile(blob, d.filename)}>Share</Action>
          <Action onClick={() => download(blob, d.filename)}>Download</Action>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open full screen
            </a>
          )}
        </div>
        {url &&
          (d.mime === "application/pdf" ? (
            <iframe title={d.title} src={url} referrerPolicy="no-referrer" />
          ) : (
            <img src={url} alt={d.title} />
          ))}
      </div>
    </Modal>
  );
}
