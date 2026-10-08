import { escape, documentDate, imageURI, wrapLines, appendix } from "./common";
export function diaryPage(d, page, book) {
  const date = d.date,
    time = (i) =>
      String(Math.floor(i / 4)).padStart(2, "0") +
      ":" +
      String((i % 4) * 15).padStart(2, "0");
  const day = () => ({
    ...d,
    truck: d.vehicle,
    rows: d.changes,
    details: {
      comments: d.comments,
      book: book?.number,
      page: page?.number,
      status: page?.status,
      base: d.profile.base,
      licence: d.profile.licence,
      scheme: d.profile.scheme,
      twoUp: d.profile.twoUp,
      codriver: d.profile.coDriver,
      checkTime: d.dailyCheckTime,
    },
  });
  const blankDay = day;
  const $ = () => ({ value: d.profile.name });
  const escapeHtml = escape;
  function svgText(
    x,
    y,
    text,
    size = 12,
    fill = "#111",
    weight = "400",
    extra = "",
  ) {
    return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" font-family="Arial, Helvetica, sans-serif" ${extra}>${escapeHtml(text || "")}</text>`;
  }
  function wrapSvgTextLines(text, maxChars = 74, maxLines = 4) {
    const raw = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return [];
    const words = raw.split(" ");
    const lines = [];
    let line = "";
    words.forEach((w) => {
      if ((line + " " + w).trim().length <= maxChars) {
        line = (line + " " + w).trim();
      } else {
        if (line) lines.push(line);
        line = w;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] =
        kept[maxLines - 1]
          .slice(0, Math.max(0, maxChars - 1))
          .replace(/\s+$/, "") + "…";
      return kept;
    }
    return lines;
  }
  function svgRect(
    x,
    y,
    w,
    h,
    fill = "none",
    stroke = "#111",
    sw = 1,
    extra = "",
  ) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  }
  function svgLine(x1, y1, x2, y2, stroke = "#111", sw = 1, extra = "") {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  }
  function svgCheckbox(x, y, label, checked = false, size = 13) {
    return `${svgRect(x, y, size, size, "#fff", "#111", 1)}${checked ? svgText(x + 2, y + size - 2, "X", size + 1, "#1439d6", "700") : ""}${svgText(x + size + 4, y + size - 2, label, 11, "#111", "400")}`;
  }
  function svgBoxedLetters(
    x,
    y,
    letters,
    active,
    boxW = 25,
    boxH = 24,
    fontSize = 12,
  ) {
    return letters
      .map((l, i) => {
        const bx = x + i * boxW;
        const on = Array.isArray(active)
          ? active.includes(l)
          : active === l || active === i;
        return `${svgRect(bx, y, boxW, boxH, "#fff", "#111", 1)}${svgText(bx + boxW / 2, y + 17, l, fontSize, "#111", "400", 'text-anchor="middle"')}${on ? svgText(bx + boxW / 2 - 4, y + boxH - 3, "X", fontSize + 4, "#1439d6", "700") : ""}`;
      })
      .join("");
  }

  const meta = day().details || blankDay().details;
  const detail = {
    comments: meta.comments,
    workDiaryNo: meta.book,
    pageNo: meta.page,
    numberPlate: day().truck,
    twoUpEnabled: meta.twoUp,
    twoUpDriverName: meta.codriver,
    twoUpLicenceNumber: d.profile.coLicence,
    twoUpScheme: d.profile.coScheme,
    twoUpBaseState: d.profile.coBase,
    dailyCheckTime: meta.checkTime,
    fitForDuty: !!d.fitForDuty,
  };
  const pageStatus =
    meta.status === "Cancelled"
      ? "cancelled"
      : meta.status === "Skipped"
        ? "skipped"
        : "active";
  const pageStatusText =
      pageStatus === "cancelled"
        ? "CANCELLED / VOID PAGE"
        : "SKIPPED / UNUSED PAGE",
    pageStatusReason = page?.reason || "";
  const keys = [
    ...new Set([
      ...Object.keys(d.changes).map(Number),
      ...d.slots.flatMap((k, i) =>
        k && (i === 0 || d.slots[i - 1] !== k) ? [i] : [],
      ),
    ]),
  ].sort((a, b) => a - b);
  const changeRows = keys.map((i) => ({ time: time(i), ...d.changes[i] }));
  const totals = {
    work: day().slots.filter((v) => v === "work").length * 15,
    rest: day().slots.filter((v) => v === "rest").length * 15,
  };
  const dayIdx = new Date(date + "T12:00:00Z").getUTCDay(),
    base = meta.base || "";
  const workDiaryNo = detail.workDiaryNo || "",
    pageNo = detail.pageNo || "",
    driver = $("tw-driver-name").value,
    licence = meta.licence || "",
    plate = day().truck,
    dateStr = documentDate(date);
  const currentScheme =
    meta.scheme === "Standard hours" ? "Standard" : meta.scheme;
  const isBFM = currentScheme === "BFM",
    isStandard = currentScheme === "Standard" || currentScheme === "ACH",
    isAFM = currentScheme === "AFM";
  const rowDetailsNotRequired = () => false,
    timeToMins = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
  const W = 1120,
    H = 732;
  const dark = "#555";
  const blue = "#1439d6";
  const red = "#d82626";

  const sectionX = 28;
  const sectionY = 178;
  const sectionW = 1064;
  const sectionH = 410;
  const verticalW = 44;
  const labelW = 105;
  const gridX = sectionX + verticalW + labelW;
  const gridRight = 986;
  const sideRight = 1092;
  const slotW = (gridRight - gridX) / 96;

  const commentBottom = 246;
  const odoBottom = 332;
  const locBottom = 432;
  const twoUpBottom = 455;
  const numberBottom = 480;
  const workBottom = 535;
  const restBottom = 588;

  const workY = 508;
  const restY = 561;

  const gridLines = [];
  for (let i = 0; i <= 24; i++) {
    const x = gridX + i * 4 * slotW;
    gridLines.push(svgLine(x, commentBottom, x, numberBottom, "#111", 1));
  }
  for (let i = 0; i <= 96; i++) {
    const x = gridX + i * slotW;
    const major = i % 4 === 0;
    gridLines.push(
      svgLine(
        x,
        numberBottom,
        x,
        restBottom,
        major ? "#111" : "#777",
        major ? 1 : 0.55,
      ),
    );
  }

  const hourNums = [];
  for (let h = 0; h <= 24; h++) {
    const x = gridX + h * 4 * slotW;
    const n = h === 0 || h === 24 ? "12" : h > 12 ? String(h - 12) : String(h);
    hourNums.push(
      svgText(x, 476, n, 14, "#111", "400", 'text-anchor="middle"'),
    );
    hourNums.push(
      svgText(x, 606, n, 14, "#111", "400", 'text-anchor="middle"'),
    );
  }

  let lineD = "";
  for (let i = 0; i < 96; i++) {
    const kind = day().slots[i];
    if (!kind) continue;
    const y = kind === "work" ? workY : restY,
      x = gridX + i * slotW;
    const previous = i > 0 ? day().slots[i - 1] : null;
    if (!previous) lineD += ` M ${x} ${y}`;
    else if (previous !== kind) lineD += ` L ${x} ${y}`;
    lineD += ` L ${x + slotW} ${y}`;
  }

  const changeText = [];
  changeRows.forEach((r) => {
    if (rowDetailsNotRequired(r)) return;
    const mins = timeToMins(r.time);
    const x = gridX + (mins / 15) * slotW + 9;
    if (r.odometer) {
      changeText.push(
        `<text transform="translate(${x},318) rotate(-90)" font-size="12" fill="${blue}" font-weight="700" font-family="Arial">${escapeHtml(r.odometer)}</text>`,
      );
    }
    const loc = r.location || "";
    if (loc) {
      changeText.push(
        `<text transform="translate(${x},420) rotate(-90)" font-size="12" fill="${blue}" font-weight="700" font-family="Arial" ${loc.length * 6.5 > 90 ? 'textLength="90" lengthAdjust="spacingAndGlyphs"' : ""}>${escapeHtml(loc)}</text>`,
      );
    }
  });

  const stateBoxes = svgBoxedLetters(
    382,
    134,
    ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"],
    base,
    38,
    24,
    10,
  );
  const dayBoxes = svgBoxedLetters(
    520,
    86,
    ["S", "M", "T", "W", "T", "F", "S"],
    dayIdx,
    25,
    25,
    11,
  );
  const twoUpScheme = detail.twoUpScheme || "BFM";
  const twoUpState = detail.twoUpBaseState || "";
  const twoUpStates = svgBoxedLetters(
    665,
    697,
    ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"],
    twoUpState,
    30,
    24,
    9,
  );

  const workRestOptions =
    svgCheckbox(700, 86, "Standard", isStandard, 12) +
    svgCheckbox(778, 86, "Standard Bus", false, 12) +
    svgCheckbox(700, 112, "BFM", isBFM, 12) +
    svgCheckbox(778, 112, "AFM", isAFM, 12) +
    svgCheckbox(700, 138, "Fit for Duty", !!detail.fitForDuty, 12);

  const twoUpCheck =
    svgCheckbox(
      880,
      661,
      "Standard",
      detail.twoUpEnabled && twoUpScheme === "Standard",
      12,
    ) +
    svgCheckbox(
      950,
      661,
      "BFM",
      detail.twoUpEnabled && twoUpScheme === "BFM",
      12,
    ) +
    svgCheckbox(
      1000,
      661,
      "AFM",
      detail.twoUpEnabled && twoUpScheme === "AFM",
      12,
    );

  const comments = wrapSvgTextLines(detail.comments || "", 74, 4)
    .map((line, i) => svgText(gridX + 8, 194 + i * 13, line, 10, blue, "700"))
    .join("");

  const svg = `
  <svg class="tw-paper" viewBox="0 0 ${W} ${H}" role="img" aria-label="Paper diary sheet preview for ${escapeHtml(dateStr)}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
    ${svgText(560, 46, "PERSONAL RECORD COPY - NOT AN APPROVED ELECTRONIC WORK DIARY", 9, "#555", "400", 'text-anchor="middle"')}

    ${svgText(560, 28, "NATIONAL WORK DIARY DAILY SHEET", 17, "#111", "700", 'text-anchor="middle"')}
    ${svgText(790, 39, "WORK DIARY NO.", 10, "#111", "700")}
    ${svgText(920, 39, workDiaryNo, Math.min(16, 90 / Math.max(1, workDiaryNo.length * 0.6)), "#111", "700")}
    ${svgText(1088, 39, pageNo, 18, red, "700", 'text-anchor="end"')}

    <rect x="28" y="50" width="1064" height="24" fill="${dark}"/>
    ${svgText(560, 67, "DRIVER IDENTIFICATION", 15, "#fff", "700", 'text-anchor="middle"')}

    ${svgText(34, 88, "Driver's Name:", 9)}
    ${svgRect(34, 92, 348, 26)}
    ${svgText(208, 109, driver, 16, blue, "700", 'text-anchor="middle"')}

    ${svgText(392, 88, "Date:", 9)}
    ${svgRect(392, 92, 126, 26)}
    ${svgText(455, 109, dateStr, 15, blue, "700", 'text-anchor="middle"')}

    ${svgText(522, 82, "Day of the Week:", 9)}
    ${dayBoxes}

    ${svgText(700, 82, "Driver", 9)}
    ${workRestOptions}

    ${svgText(888, 82, "Time of daily check (if required):", 8)}
    ${svgRect(888, 92, 192, 26)}
    ${svgText(984, 109, detail.dailyCheckTime || "", 14, blue, "700", 'text-anchor="middle"')}

    ${svgText(34, 130, "License No:", 9)}
    ${svgRect(34, 134, 178, 28)}
    ${svgText(123, 153, licence, 15, blue, "700", 'text-anchor="middle"')}

    ${svgText(225, 130, "Number Plate:", 9)}
    ${svgRect(225, 134, 145, 28)}
    ${svgText(297, 153, plate, 15, blue, "700", 'text-anchor="middle"')}

    ${svgText(382, 130, "Time Zone: State/Territory (Driver Base)", 9)}
    ${stateBoxes}

    ${svgRect(sectionX, sectionY, verticalW, sectionH, dark, dark)}
    <text transform="translate(${sectionX + 28},${sectionY + sectionH / 2}) rotate(-90)" font-size="17" fill="#fff" font-weight="700" font-family="Arial" text-anchor="middle">DETAILS OF ACTIVITIES FOR THIS DAY</text>

    ${svgRect(sectionX + verticalW, sectionY, sectionW - verticalW, sectionH)}
    ${svgLine(sectionX + verticalW, commentBottom, sideRight, commentBottom)}
    ${svgLine(sectionX + verticalW, odoBottom, gridRight, odoBottom)}
    ${svgLine(sectionX + verticalW, locBottom, gridRight, locBottom)}
    ${svgLine(sectionX + verticalW, twoUpBottom, gridRight, twoUpBottom)}
    ${svgLine(sectionX + verticalW, numberBottom, sideRight, numberBottom)}
    ${svgLine(sectionX + verticalW, workBottom, sideRight, workBottom)}
    ${svgLine(sectionX + verticalW, restBottom, sideRight, restBottom)}
    ${svgLine(gridX, sectionY, gridX, restBottom)}
    ${svgLine(gridRight, commentBottom, gridRight, restBottom)}
    ${svgLine(1018, numberBottom, 1018, restBottom)}

    ${svgText(78, 192, "Number Plate", 10)}
    ${svgText(78, 205, "Change and", 10)}
    ${svgText(78, 218, "Comments", 10)}
    ${svgText(78, 231, "(optional)", 8)}
    ${comments}

    ${svgText(78, 290, "Odometer", 10)}
    ${svgText(78, 304, "Reading", 10)}

    ${svgText(78, 362, "Name of", 10)}
    ${svgText(78, 376, "Location at", 10)}
    ${svgText(78, 390, "Work and", 10)}
    ${svgText(78, 404, "Rest Change", 10)}
    ${svgText(78, 418, "(suburb/town)", 8)}

    ${svgText(78, 448, "Two-up", 10)}
    ${svgText(78, 507, "My Work", 10)}
    ${svgText(78, 561, "My Rest", 10)}

    ${svgText(998, 288, "Space for your", 8)}
    ${svgText(998, 300, "work/rest hours", 8)}
    ${svgText(998, 312, "(optional)", 8)}

    ${gridLines.join("")}
    ${hourNums.join("")}
    ${changeText.join("")}
    <path d="${lineD}" fill="none" stroke="${blue}" stroke-width="2.2"/>

    ${svgText(1028, 456, "All drivers:", 8)}
    ${svgText(1028, 467, "calculate totals", 8)}
    ${svgText(1052, 494, "Total Work:", 10, "#111", "700", 'text-anchor="middle"')}
    ${svgText(1052, 518, `${Math.floor(totals.work / 60)}h ${totals.work % 60}m`, 17, blue, "700", 'text-anchor="middle"')}
    ${svgText(1052, 545, "Total Rest:", 10, "#111", "700", 'text-anchor="middle"')}
    ${svgText(1052, 570, `${Math.floor(totals.rest / 60)}h ${totals.rest % 60}m`, 17, blue, "700", 'text-anchor="middle"')}

    ${svgText(32, 612, "Driver Signature:", 10)}
    ${svgText(32, 639, "To the best of my knowledge and belief the information I have recorded on this", 8)}
    ${svgText(32, 651, "daily sheet is true and correct", 8)}
    ${svgRect(32, 662, 350, 34)}

    <rect x="405" y="610" width="688" height="24" fill="${dark}"/>
    ${svgText(749, 627, "TWO-UP DRIVER'S IDENTIFICATION", 15, "#fff", "700", 'text-anchor="middle"')}

    ${svgText(405, 648, "Two-up Driver's Name:", 9)}
    ${svgRect(405, 653, 220, 28)}
    ${svgText(515, 672, detail.twoUpEnabled ? detail.twoUpDriverName || "" : "", 13, blue, "700", 'text-anchor="middle"')}

    ${svgText(645, 648, "Two-up Driver's License No:", 9)}
    ${svgRect(645, 653, 210, 28)}
    ${svgText(750, 672, detail.twoUpEnabled ? detail.twoUpLicenceNumber || "" : "", 13, blue, "700", 'text-anchor="middle"')}

    ${svgText(880, 648, "Two-up Driver", 9)}
    ${twoUpCheck}

    ${svgText(405, 692, "Two-up Driver's Work Diary & Page No:", 9)}
    ${svgRect(405, 697, 220, 26)}

    ${svgText(665, 692, "Two-up Driver's License issued:", 9)}
    ${twoUpStates}

    ${svgText(930, 692, "Two-up Driver Signature:", 9)}
    ${svgRect(930, 697, 163, 26)}

    ${pageStatus !== "active" ? `<text x="560" y="400" font-size="70" fill="rgba(210,0,0,.22)" font-weight="900" font-family="Arial" text-anchor="middle" transform="rotate(-20 560 400)">${escapeHtml(pageStatusText)}</text>` : ""}
    ${pageStatus !== "active" ? svgText(560, 435, pageStatusReason, 16, red, "700", 'text-anchor="middle"') : ""}
  </svg>`;

  const banner =
    pageStatus !== "active"
      ? `<div class="statusBanner ${pageStatus === "skipped" ? "skipped" : ""}">${escapeHtml(pageStatusText)}${pageStatusReason ? ": " + escapeHtml(pageStatusReason) : ""}</div>`
      : "";
  return `${svg}`;
}

export function diaryPages(d, page, book) {
  const pages = [diaryPage(d, page, book)],
    lines = [
      `Driver: ${d.profile.name} | Licence: ${d.profile.licence} | Base: ${d.profile.base}`,
      `Scheme: ${d.profile.scheme} | ${d.profile.twoUp ? "Two-up with " + d.profile.coDriver : "Solo"} | Vehicle: ${d.vehicle}`,
      `Book: ${book?.number || ""} | Page: ${page?.number || ""} | Status: ${page?.status || "Unallocated"}`,
      ...wrapLines("Comments: " + d.comments, 95),
      "",
      ...Object.values(d.changes)
        .sort((a, b) => a.slot - b.slot)
        .flatMap((c) =>
          wrapLines(
            `${String(Math.floor(c.slot / 4)).padStart(2, "0")}:${String((c.slot % 4) * 15).padStart(2, "0")} | ${d.slots[c.slot] || "Finish"} | ${c.location} | Odo ${c.odometer} | ${c.vehicle} | ${c.restType} | ${c.note}`,
            95,
          ),
        ),
    ];
  for (let i = 0; i < lines.length; i += 48)
    pages.push(
      appendix(
        "Diary detail record · " + documentDate(d.date),
        lines.slice(i, i + 48),
      ),
    );
  return pages;
}
