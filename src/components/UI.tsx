import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { displayCivil, displayDate } from "../domain/time";
import { useStore } from "../context";
export function Field({
  label,
  value,
  onChange,
  type = "text",
  options,
  wide = false,
  disabled = false,
  placeholder = "",
  list,
  min,
  step,
}: {
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  type?: string;
  options?: Array<string | [string, string]>;
  wide?: boolean;
  disabled?: boolean;
  placeholder?: string;
  list?: string;
  min?: string;
  step?: string;
}) {
  const [draft, setDraft] = useState(String(value ?? "")),
    focused = useRef(false),
    id = useId();
  useEffect(() => {
    if (!focused.current) setDraft(String(value ?? ""));
  }, [value]);
  const props = {
    id,
    "aria-label": label,
    disabled,
    value: draft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
    },
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setDraft(e.target.value);
      onChange(e.target.value);
    },
  };
  return (
    <label className={"field " + (wide ? "wide" : "")} htmlFor={id}>
      <span>{label}</span>
      {options ? (
        <select
          id={id}
          aria-label={label}
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => {
            const [a, b] = typeof o === "string" ? [o, o] : o;
            return (
              <option key={a} value={a}>
                {b}
              </option>
            );
          })}
        </select>
      ) : type === "textarea" ? (
        <textarea {...props} rows={3} />
      ) : ["date", "time", "datetime-local"].includes(type) ? (
        <span className="civil-input">
          <input {...props} lang="en-AU" type={type} min={min} step={step} />
          <span aria-hidden="true">
            {draft
              ? type === "date"
                ? displayDate(draft)
                : displayCivil(draft)
              : type === "date"
                ? "dd/mm/yyyy"
                : type === "time"
                  ? "hh:mm"
                  : "dd/mm/yyyy · hh:mm"}
          </span>
        </span>
      ) : (
        <input
          {...props}
          type={type}
          placeholder={placeholder}
          list={list}
          min={min}
          step={step}
        />
      )}
    </label>
  );
}
export function Check({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function Fold({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="card fold" open={open || undefined}>
      <summary>{title}</summary>
      <div className="fold-content">{children}</div>
    </details>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Action({
  children,
  onClick,
  primary = false,
  danger = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => unknown | Promise<unknown>;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { run } = useStore();
  return (
    <button
      disabled={disabled}
      className={(primary ? "primary " : "") + (danger ? "danger" : "")}
      onClick={() => run(onClick)}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { error, clear } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <header className="row">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </header>
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button onClick={clear} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {children}
    </dialog>
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function shareFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
  } else download(blob, name);
}
export async function readImage(file: File, max = 1600) {
  if (!file.type.startsWith("image/")) throw Error("Choose an image.");
  if (file.size > 15 * 1024 * 1024)
    throw Error("Choose an image smaller than 15 MB.");
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height)),
    c = document.createElement("canvas");
  c.width = bitmap.width * scale;
  c.height = bitmap.height * scale;
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c.toDataURL("image/png");
}
export function ImageInput({
  label,
  onChange,
}: {
  label: string;
  onChange: (v: string) => void;
}) {
  const { run } = useStore();
  return (
    <label className="file-button">
      {label}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(async () => onChange(await readImage(f)));
          e.target.value = "";
        }}
      />
    </label>
  );
}
