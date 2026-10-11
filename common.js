export const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const documentDate = (iso) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
export const imageURI = (v) =>
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v || "") ? v : "";
export function wrapLines(text, max = 100) {
  return String(text || "")
    .split("\n")
    .flatMap((p) => {
      const lines = [];
      let line = "";
      for (const word of p.split(/\s+/)) {
        for (let pos = 0; pos < word.length; pos += max) {
          const w = word.slice(pos, pos + max);
          if ((line + " " + w).trim().length > max) {
            lines.push(line);
            line = w;
          } else line = (line + " " + w).trim();
        }
      }
      lines.push(line);
      return lines;
    });
}
export function appendix(title, lines) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.28 841.89"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="Arial"><text x="30" y="40" font-size="15">${escape(title)}</text>${lines.map((l, i) => `<text x="30" y="${70 + i * 14}" font-size="10">${escape(l)}</text>`).join("")}</g></svg>`;
}
