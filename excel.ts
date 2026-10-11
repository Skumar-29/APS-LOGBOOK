import { validateInvoice, isCO } from "../domain/invoices";
import type { Invoice } from "../domain/model";
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const encoder = new TextEncoder();
function zip(files: Record<string, string>) {
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  const crc = (data: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of data) {
      c ^= b;
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const [name, text] of Object.entries(files)) {
    const n = encoder.encode(name),
      data = encoder.encode(text),
      sum = crc(data),
      header = new Uint8Array(30 + n.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint32(14, sum, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, n.length, true);
    header.set(n, 30);
    const entry = new Uint8Array(46 + n.length),
      e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint32(16, sum, true);
    e.setUint32(20, data.length, true);
    e.setUint32(24, data.length, true);
    e.setUint16(28, n.length, true);
    e.setUint32(42, offset, true);
    entry.set(n, 46);
    central.push(entry);
    parts.push(header, data);
    offset += header.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + 22);
  let pos = 0;
  for (const b of [...parts, ...central, end]) {
    result.set(b, pos);
    pos += b.length;
  }
  return result;
}
export function invoiceExcel(inv: Invoice) {
  const { invoice: i, main, misc, total } = validateInvoice(inv);
  const rows: Array<{ cells: unknown[]; style: number }> = [];
  const row = (cells: unknown[], style = 0) => rows.push({ cells, style });
  row(["INVOICE " + i.invoiceNo], 1);
  for (const [label, key] of [
    ["Name / SG No", "nameSg"],
    ["Bill to", "billTo"],
    ["Mobile", "mobile"],
    ["Email", "email"],
    ["BSB", "bsb"],
    ["Account number", "accountNo"],
    ["ABN / ACN", "abnAcn"],
    ["Date from", "dateFrom"],
    ["Date to", "dateTo"],
    ["Yellow pages submitted", "yellowDate"],
  ])
    row([label, i[key]], 2);
  row([]);
  row(
    [
      "Load date",
      "From",
      "To",
      "Type",
      "Start odometer",
      "Finish odometer",
      "Quantity / KM",
      "Rate",
      "Amount",
    ],
    1,
  );
  for (const r of i.loads)
    row(
      [
        r.loadDate,
        r.from,
        r.to,
        r.type,
        r.odoStart,
        r.odoFinish,
        Number(r.km || 0),
        isCO(r.type) ? "FIX RATE" : Number(r.rate || 0),
        Number(r.amount),
      ],
      rows.length % 2 ? 2 : 0,
    );
  row(["LOAD TOTAL", "", "", "", "", "", "", "", main], 2);
  row([]);
  row(["Date", "Item", "Quantity", "Rate", "Amount"], 1);
  for (const r of i.misc)
    row(
      [
        r.date,
        r.item,
        Number(r.quantity || 0),
        Number(r.rate || 0),
        Number(r.amount),
      ],
      rows.length % 2 ? 2 : 0,
    );
  row(["MISCELLANEOUS TOTAL", "", "", "", misc], 2);
  row(["COMBINED TOTAL", "", "", "", total], 2);
  row([]);
  row(["NOTES"], 1);
  for (const line of i.notes.split("\n")) row([line]);
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="9" width="18" customWidth="1"/></cols><sheetData>${rows
    .map(
      ({ cells, style }, n) =>
        `<row r="${n + 1}">${cells
          .map((v, c) => {
            const ref = String.fromCharCode(65 + c) + (n + 1);
            return typeof v === "number"
              ? `<c r="${ref}" s="${style}"><v>${v}</v></c>`
              : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(v)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("")}</sheetData></worksheet>`;
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Invoice" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":
      '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176F8B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC5E8F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    "xl/worksheets/sheet1.xml": sheet,
  });
}
