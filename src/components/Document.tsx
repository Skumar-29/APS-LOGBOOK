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
    [preparationError, setPreparationError] = useState("");
  useEffect(() => { let live = true; setPrepared([]);setPreparationError("");
    import("../documents/pdf").then(m => m.preparePdfPages(pages)).then(result => {if(live)setPrepared(result);}).catch(error => {if(live)setPreparationError(error.message);});
    return () => {live=false;};
  }, [pages]);
  async function output(share = false) {
    setBusy(true);
    try {
      const { createPdf } = await import("../documents/pdf");
      const blob = await createPdf(prepared, name);
      if (share) await shareFile(blob, name + ".pdf");
      else download(blob, name + ".pdf");
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
        <Action disabled={busy || !prepared.length} onClick={() => output()} primary>
          {busy ? "Creating PDF…" : "Download PDF"}
        </Action>
        <Action disabled={busy || !prepared.length} onClick={() => output(true)}>
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
