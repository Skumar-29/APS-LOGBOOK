import { escape, documentDate, imageURI, wrapLines, appendix } from "./common";
export function invoicePages(inv) {
  const money = (n) => "$" + (Number(n) || 0).toFixed(2);
  const parseNum = (v) => Number(v) || 0;
  const dateDisplay = (iso) =>
    iso ? documentDate(iso).slice(0, -4) + iso.slice(2, 4) : "";
  const dateLong = documentDate;
  const invoiceTotals = (i) => ({
    main: i.loads.reduce((n, r) => n + parseNum(r.amount), 0),
    misc: i.misc.reduce((n, r) => n + parseNum(r.amount), 0),
  });
  const formatRatePlain = (v) =>
    v === "" || v === undefined
      ? ""
      : typeof v === "number"
        ? "$" + v.toFixed(2).replace(/\.00$/, "")
        : String(v);
  const displayLoadRatePlain = (r) =>
    /C\s*\/?\s*O/i.test(r.type) ? "FIX RATE" : formatRatePlain(r.rate);
  const newMiscRow = () => ({
    date: "",
    item: "",
    quantity: "",
    rate: "",
    amount: "",
  });
  const padRows = (rows, count, blank) => {
    const out = rows.slice();
    while (out.length < count) out.push({ ...blank });
    return out;
  };
  const dark = [0.09, 0.435, 0.545],
    light = [0.773, 0.91, 0.957],
    white = [1, 1, 1];
  const rgb = (arr) =>
    "rgb(" + arr.map((v) => Math.round(v * 255)).join(",") + ")";
  function pdfText(x, y, text, size = 10, bold = false, align = "left") {
    text = String(text ?? "");
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${bold ? "bold" : "normal"}" text-anchor="${align === "center" ? "middle" : align === "right" ? "end" : "start"}">${escape(text)}</text>`;
  }
  function fitText(x, y, text, size, bold, width, align = "left") {
    const n = String(text ?? "").length;
    return pdfText(
      x,
      y,
      text,
      Math.min(size, width / Math.max(1, n * 0.55)),
      bold,
      align,
    );
  }
  function rect(x, y, w, h, fill, stroke = true) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill ? rgb(fill) : "none"}" stroke="${stroke ? "#48b4d8" : "none"}" stroke-width="0.7"/>`;
  }
  function line(x1, y1, x2, y2) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#48b4d8" stroke-width="0.7"/>`;
  }
  function columnLines(x, y1, y2, cols, skipBoundaries = []) {
    let out = "",
      cx = x;
    for (let i = 0; i <= cols.length; i++) {
      if (!skipBoundaries.includes(i)) out += line(cx, y1, cx, y2);
      cx += cols[i] || 0;
    }
    return out;
  }
  function addWrappedText(
    parts,
    x,
    y,
    text,
    size,
    bold,
    maxWidth,
    lineGap = 11,
  ) {
    const words = String(text || "").split(/\s+/);
    let lineTxt = "",
      yy = y;
    const maxChars = Math.max(8, Math.floor(maxWidth / (size * 0.48)));
    words.forEach((w) => {
      const test = lineTxt ? lineTxt + " " + w : w;
      if (test.length > maxChars) {
        parts.push(pdfText(x, yy, lineTxt, size, bold));
        yy += lineGap;
        lineTxt = w;
      } else lineTxt = test;
    });
    if (lineTxt) parts.push(pdfText(x, yy, lineTxt, size, bold));
  }
  function buildPdfPage(inv, page) {
    const t = invoiceTotals(inv);
    const parts = [];
    const setBlack = '</g><g fill="#000">',
      setWhite = '</g><g fill="#fff">',
      setTeal = '</g><g fill="#18495c">';
    parts.push(setBlack);
    parts.push(pdfText(297.64, 26, "INVOICE", 18, true, "center"));
    if (page.pageCount > 1)
      parts.push(
        pdfText(580, 26, `${page.pageNo}/${page.pageCount}`, 8, false, "right"),
      );
    parts.push(line(258, 30, 337, 30));
    // top details - matched to the attached invoice proportions
    const lx = 15,
      rx = 323,
      topY = 50,
      lw = 238,
      rw = 257,
      normalH = 20,
      tallH = 40;
    const leftRows = [
      ["Name/SG No:", inv.nameSg, normalH],
      ["Mobile no.", inv.mobile, normalH],
      ["Email id:", inv.email, normalH],
      ["BSB", inv.bsb, normalH],
      ["Account No", inv.accountNo, normalH],
      ["ABN/ACN No", inv.abnAcn, normalH],
    ];
    const rightRows = [
      ["Bill To:", inv.billTo, normalH],
      ["Invoice No.:", inv.invoiceNo, normalH],
      ["Date From:", dateDisplay(inv.dateFrom), normalH],
      ["Date to:", dateDisplay(inv.dateTo), normalH],
      ["Yello Pages\nSubmitted (Till date)", dateLong(inv.yellowDate), tallH],
    ];
    function drawInfo(x, y, w, labelW, rows) {
      let yy = y;
      rows.forEach((r, i) => {
        const h = r[2] || normalH;
        parts.push(rect(x, yy, w, h, i % 2 === 1 ? light : white));
        parts.push(line(x + labelW, yy, x + labelW, yy + h));
        parts.push(setTeal);
        if (String(r[0]).includes("\n")) {
          const a = String(r[0]).split("\n");
          parts.push(pdfText(x + 5, yy + 14, a[0], 9.5, true));
          parts.push(pdfText(x + 5, yy + 27, a[1], 9.5, true));
        } else parts.push(pdfText(x + 5, yy + 13, r[0], 10, true));
        parts.push(setBlack);
        parts.push(
          fitText(
            x + labelW + 6,
            yy + (h > normalH ? 24 : 13),
            r[1],
            10,
            false,
            w - labelW - 12,
          ),
        );
        yy += h;
      });
    }
    drawInfo(lx, topY, lw, 100, leftRows);
    drawInfo(rx, topY, rw, 155, rightRows);
    // main load table
    const x = 10,
      y = 205,
      w = 575,
      headerH = 47,
      rowH = 27,
      totalH = 26;
    const cols = [72, 56, 53, 64, 54, 54, 71, 64, 87];
    parts.push(rect(x, y, w, headerH, dark, false));
    // Header keeps Odometer Reading as one merged cell, so there is no vertical line through that header box.
    parts.push(columnLines(x, y, y + headerH, cols, [5]));
    parts.push(line(x, y, x + w, y));
    parts.push(line(x, y + headerH, x + w, y + headerH));
    parts.push(setWhite);
    let cx = x;
    const headers = [
      "Load Date",
      "From",
      "To",
      "BD/RT/\nBT/AB",
      "",
      "",
      "Quant./KM",
      "Rate",
      "Amount",
    ];
    headers.forEach((h, i) => {
      if (i === 4) {
        parts.push(
          pdfText(
            cx + (cols[4] + cols[5]) / 2,
            y + 17,
            "Odometer",
            10,
            true,
            "center",
          ),
        );
        parts.push(
          pdfText(
            cx + (cols[4] + cols[5]) / 2,
            y + 31,
            "Reading",
            10,
            true,
            "center",
          ),
        );
      } else if (h) {
        const hs = h.split("\n");
        parts.push(
          pdfText(cx + cols[i] / 2, y + 20, hs[0], 9.5, true, "center"),
        );
        if (hs[1])
          parts.push(
            pdfText(cx + cols[i] / 2, y + 33, hs[1], 9.5, true, "center"),
          );
      }
      cx += cols[i];
    });
    parts.push(setBlack);
    page.loads.forEach((r, ri) => {
      const yy = y + headerH + ri * rowH;
      parts.push(rect(x, yy, w, rowH, ri % 2 === 0 ? light : white));
      parts.push(columnLines(x, yy, yy + rowH, cols));
      parts.push(setBlack);
      let cc = x;
      const vals = [
        dateDisplay(r.loadDate),
        r.from,
        r.to,
        r.type,
        r.odoStart,
        r.odoFinish,
        r.km,
        displayLoadRatePlain(r),
        r.amount ? money(parseNum(r.amount)) : "",
      ];
      vals.forEach((v, ci) => {
        parts.push(
          fitText(
            cc + cols[ci] / 2,
            yy + 17,
            v,
            8.4,
            false,
            cols[ci] - 6,
            "center",
          ),
        );
        cc += cols[ci];
      });
    });
    const continued = page.pageCount > 1 && page.pageNo < page.pageCount;
    const ty = y + headerH + page.loads.length * rowH;
    parts.push(rect(x, ty, w, totalH, light));
    parts.push(line(x + w - cols[8], ty, x + w - cols[8], ty + totalH));
    parts.push(setBlack);
    parts.push(
      pdfText(
        x + w / 2 - 20,
        ty + 17,
        continued ? "CONTINUED ON NEXT PAGE" : "TOTAL",
        11,
        true,
        "center",
      ),
    );
    if (!continued)
      parts.push(pdfText(x + w - 8, ty + 17, money(t.main), 10, true, "right"));
    if (page.showMisc) {
      // misc table and notes kept on the final page
      const my = 580;
      parts.push(rect(x, my, w, 24, dark, false));
      parts.push(setWhite);
      parts.push(
        pdfText(x + w / 2, my + 16, "MISCELLANEOUS", 11, true, "center"),
      );
      const mCols = [115, 207, 80, 63, 110];
      const mhY = my + 24,
        mh = 23;
      parts.push(rect(x, mhY, w, mh, light));
      parts.push(columnLines(x, mhY, mhY + mh, mCols));
      parts.push(setBlack);
      let mc = x;
      ["Date", "ITEM", "QUANTITY", "RATE", "AMOUNT"].forEach((h, i) => {
        parts.push(pdfText(mc + 5, mhY + 15, h, 9.3, false));
        mc += mCols[i];
      });
      const misc = padRows(page.misc, 4, newMiscRow());
      misc.forEach((r, ri) => {
        const yy = mhY + mh + ri * 25;
        parts.push(rect(x, yy, w, 25, ri % 2 === 1 ? light : white));
        parts.push(columnLines(x, yy, yy + 25, mCols));
        parts.push(setBlack);
        let cc = x;
        const vals = [
          dateDisplay(r.date),
          r.item,
          r.quantity,
          formatRatePlain(r.rate),
          r.amount ? money(parseNum(r.amount)) : "",
        ];
        vals.forEach((v, ci) => {
          parts.push(fitText(cc + 5, yy + 16, v, 8.8, false, mCols[ci] - 10));
          cc += mCols[ci];
        });
      });
      const mty = mhY + mh + misc.length * 25;
      parts.push(rect(x, mty, w, 25, light));
      parts.push(line(x + w - mCols[4], mty, x + w - mCols[4], mty + 25));
      parts.push(setBlack);
      parts.push(
        pdfText(x + w / 2 - 20, mty + 17, "TOTAL", 11, true, "center"),
      );
      if (!continued)
        parts.push(
          pdfText(x + w - 8, mty + 17, money(t.misc), 10, true, "right"),
        );
      const ny = 775,
        nw = 575,
        nrh = 16;
      for (let i = 0; i < 4; i++)
        parts.push(rect(x, ny + i * nrh, nw, nrh, white, true));
      parts.push(setBlack);
      parts.push(pdfText(x + 5, ny + 12, "NOTES", 9.5, false));
      const noteLines = page.notes;
      noteLines.forEach((n, i) =>
        addWrappedText(
          parts,
          x + 5,
          ny + (i + 1) * nrh + 12,
          n,
          8.3,
          false,
          nw - 10,
          9,
        ),
      );
    } else {
      parts.push(setBlack);
      parts.push(
        pdfText(
          297.64,
          810,
          `Page ${page.pageNo} of ${page.pageCount}`,
          9,
          false,
          "center",
        ),
      );
    }
    return parts.join("");
  }

  const notes = wrapLines(inv.notes, 122),
    count = Math.max(
      1,
      Math.ceil(inv.loads.length / 10),
      Math.ceil(inv.misc.length / 4),
      Math.ceil(notes.length / 3),
    );
  return Array.from(
    { length: count },
    (_, i) =>
      `<svg class="tw-paper" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.28 841.89" role="img" aria-label="Invoice ${escape(inv.invoiceNo)} page ${i + 1}"><rect width="595.28" height="841.89" fill="#fff"/><g font-family="Arial, Helvetica, sans-serif"><g>${buildPdfPage(inv, { loads: padRows(inv.loads.slice(i * 10, i * 10 + 10), 10, {}), misc: inv.misc.slice(i * 4, i * 4 + 4), notes: notes.slice(i * 3, i * 3 + 3), showMisc: true, pageNo: i + 1, pageCount: count })}</g></g></svg>`,
  );
}
