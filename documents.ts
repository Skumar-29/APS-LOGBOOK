import type { SavedDocument } from "./model";
import { uid } from "./model";
import { validDate } from "./time";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_TOTAL = 24 * 1024 * 1024;
export const documentCategories = [
  "BFM certificate",
  "Police check",
  "Driver licence",
  "Accreditation / permit",
  "Other",
];
export async function fileHash(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export function decodeDocument(data: string): Uint8Array {
  const match =
    /^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      data,
    );
  if (!match)
    throw Error("Unsupported document file. Use PDF, JPG, PNG or WebP.");
  return Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
}
function mimeOf(b: Uint8Array) {
  const head = Array.from(b.slice(0, 12));
  if (String.fromCharCode(...head.slice(0, 5)) === "%PDF-")
    return "application/pdf";
  if (head.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10")
    return "image/png";
  if (head[0] === 255 && head[1] === 216 && head[2] === 255)
    return "image/jpeg";
  if (
    String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...head.slice(8)) === "WEBP"
  )
    return "image/webp";
  throw Error("Choose a PDF, JPG, PNG or WebP document.");
}
export async function makeDocument(file: File): Promise<SavedDocument> {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES)
    throw Error("Choose a document up to 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    mime = mimeOf(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return {
    id: uid(),
    title: file.name.replace(/\.[^.]+$/, ""),
    category: "Other",
    filename: file.name,
    mime,
    size: bytes.length,
    hash: await fileHash(bytes),
    data: `data:${mime};base64,${btoa(binary)}`,
    addedAt: new Date().toISOString(),
    expiry: "",
    pinned: false,
  };
}
export function validateDocument(d: SavedDocument) {
  if (
    !d ||
    !d.id ||
    !d.title?.trim() ||
    typeof d.filename !== "string" ||
    typeof d.category !== "string" ||
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      d.mime,
    ) ||
    !Number.isSafeInteger(d.size) ||
    d.size <= 0 ||
    d.size > MAX_DOCUMENT_BYTES ||
    !/^[a-f0-9]{64}$/.test(d.hash) ||
    typeof d.pinned !== "boolean" ||
    !Number.isFinite(Date.parse(d.addedAt)) ||
    (d.expiry !== "" && !validDate(d.expiry))
  )
    throw Error("Invalid saved document.");
  if (d.data !== undefined) {
    const bytes = decodeDocument(d.data);
    if (
      bytes.length !== d.size ||
      mimeOf(bytes) !== d.mime ||
      !d.data.startsWith(`data:${d.mime};`)
    )
      throw Error("Document contents do not match the file details.");
  }
  return d;
}
export function documentBlob(data: string, mime: string) {
  return new Blob([decodeDocument(data) as BlobPart], { type: mime });
}
