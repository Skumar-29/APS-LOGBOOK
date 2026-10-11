import { useEffect, useState } from "react";
import { Action, Modal, download, shareFile } from "./UI";

export function Document({
  pages,
  name,
  close,
}: {
  pages: string[];
  name: string;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [zoom, setZoom] = useState(false),
    [prepared, setPrepared] = useState<string[]>([]),
    [pdf, setPdf] = useState<Blob | null>(null),
    [preparationError, setPreparationError] = useState("");
  useEffect(() => { let live = true; setPrepared([]);setPdf(null);setPreparationError("");
    import("../documents/pdf").then(async m => {
      const result = await m.preparePdfPages(pages);
      if (live) setPrepared(result);
      const blob = await m.createPdf(result, name);
      if (live) setPdf(blob);
    }).catch(error => {if(live)setPreparationError(error.message);});
    return () => {live=false;};
  }, [pages, name]);
  async function output(share = false) {
    if (!pdf) return;
    setBusy(true);
    try {
      if (share) await shareFile(pdf, name + ".pdf");
      else download(pdf, name + ".pdf");
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) throw error;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={name} onClose={close}>
      <div className="row actions">
        <Action onClick={() => setZoom(!zoom)}>
          {zoom ? "Fit page" : "Enlarge"}
        </Action>
        <Action disabled={busy || !pdf} onClick={() => output()} primary>
          Download PDF
        </Action>
        <Action disabled={busy || !pdf} onClick={() => output(true)}>
          Share PDF
        </Action>
      </div>
      <div className={"paper-scroll " + (zoom ? "zoom" : "")}>
        {preparationError && <p role="alert">{preparationError}</p>}
        {!prepared.length && !preparationError && <p>Preparing document…</p>}
        {prepared.map((p, i) => (
          <div
            className="paper"
            key={i}
            dangerouslySetInnerHTML={{ __html: p }}
          />
        ))}
      </div>
    </Modal>
  );
}
