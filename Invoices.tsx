import { useState } from "react";
import { useStore } from "../context";
import {
  audit,
  clone,
  uid,
  type Invoice,
  type InvoiceRow,
  type MiscRow,
} from "../domain/model";
import {
  activeLoad,
  blankLoad,
  blankMisc,
  calculateInvoice,
  calculateLoad,
  calculateMisc,
  invoiceCsv,
  isCO,
  money,
  newInvoice,
  tripChoices,
  tripLoad,
  validateInvoice,
} from "../domain/invoices";
import { hhmm, displayDate } from "../domain/time";
import {
  Action,
  Check,
  Empty,
  Field,
  Fold,
  Modal,
  download,
} from "../components/UI";
import { Document } from "../components/Document";
import { invoicePages } from "../documents/invoice-pages";
export function Invoices() {
  const { s, mutate, latest } = useStore(),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [doc, setDoc] = useState<Invoice | null>(null),
    [trip, setTrip] = useState(false),
    [start, setStart] = useState(""),
    [finish, setFinish] = useState(""),
    [deleteId, setDeleteId] = useState(""),
    [detailsOpen, setDetailsOpen] = useState(false);
  const inv = s.invoices.find((i) => i.id === selected),
    locked = inv?.status === "Issued";
  async function edit(fn: (i: Invoice) => void) {
    await mutate((w) => {
      const i = w.invoices.find((i) => i.id === selected);
      if (!i) throw Error("Invoice not found.");
      if (i.status === "Issued")
        throw Error("Create a revision to change an issued invoice.");
      fn(i);
      i.updatedAt = new Date().toISOString();
    });
  }
  async function add() {
    let id = "";
    await mutate((w) => {
      const i = newInvoice(w);
      id = i.id;
      w.invoices.push(i);
      w.invoiceSettings.nextInvoiceNo++;
    });
    setSelected(id);
    setDetailsOpen(!s.invoiceSettings.profile.billTo);
  }
  function rowEdit(id: string, k: keyof InvoiceRow, v: string | boolean) {
    return edit((i) => {
      const r = i.loads.find((x) => x.id === id)!;
      (r as any)[k] = v;
      if (k === "type") {
        r.rate = s.invoiceSettings.typeRates[String(v)] || r.rate;
        if (isCO(String(v))) r.fixedAmount = r.rate;
      }
      if (k === "rate" && isCO(r.type)) r.fixedAmount = String(v);
      try {
        Object.assign(r, calculateLoad(r));
      } catch {
        /* An unfinished row stays a draft. */
      }
    });
  }
  function miscEdit(id: string, k: keyof MiscRow, v: string | boolean) {
    return edit((i) => {
      const r = i.misc.find((x) => x.id === id)!;
      (r as any)[k] = v;
      if (k === "item")
        r.rate = s.invoiceSettings.miscItemRates[String(v)] || r.rate;
      try {
        Object.assign(r, calculateMisc(r));
      } catch {
        /* Draft row. */
      }
    });
  }
  async function preview() {
    const w = await latest(),
      i = w.invoices.find((i) => i.id === selected)!;
    setDoc(validateInvoice(i).invoice);
  }
  if (!inv)
    return (
      <>
        <div className="row">
          <h1>Invoices</h1>
          <Action primary onClick={add}>
            + New invoice
          </Action>
        </div>
        <Field label="Search invoices" value={search} onChange={setSearch} />
        {s.invoices
          .filter((i) =>
            (i.invoiceNo + " " + i.billTo + " " + i.dateFrom)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((i) => (
            <button
              className="card list-button"
              key={i.id}
              onClick={() => setSelected(i.id)}
            >
              <span>
                <b>Invoice {i.invoiceNo}</b>
                <small>
                  {i.billTo || "Bill to not set"} ·{" "}
                  {displayDate(i.dateFrom) || "No period"}
                </small>
              </span>
              <span>
                {i.status}
                {i.revision > 1 ? " · r" + i.revision : ""}
              </span>
            </button>
          ))}
        {!s.invoices.length && (
          <Empty>
            Create an invoice or restore your truck invoice backup in Records.
          </Empty>
        )}
        <Fold title="Default invoice details & rates">
          <div className="fields">
            {[
              ["nameSg", "Name / SG No."],
              ["billTo", "Bill to"],
              ["mobile", "Mobile"],
              ["email", "Email"],
              ["abnAcn", "ABN / ACN"],
              ["bsb", "BSB"],
              ["accountNo", "Account number"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={s.invoiceSettings.profile[k]}
                onChange={(v) => {
                  void mutate((w) => {
                    w.invoiceSettings.profile[k] = v;
                  }).catch(() => {});
                }}
              />
            ))}
          </div>
          <h3>Load rates</h3>
          <div className="fields">
            {s.invoiceSettings.types.map((t) => (
              <Field
                key={t}
                label={t + (isCO(t) ? " · fixed" : " · per km")}
                value={s.invoiceSettings.typeRates[t]}
                onChange={(v) => {
                  void mutate((w) => {
                    w.invoiceSettings.typeRates[t] = v;
                  }).catch(() => {});
                }}
              />
            ))}
          </div>
          <Field
            label="Types (comma separated)"
            value={s.invoiceSettings.types.join(", ")}
            onChange={(v) => {
              void mutate((w) => {
                w.invoiceSettings.types = [
                  ...new Set(
                    v
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  ),
                ];
              }).catch(() => {});
            }}
          />
          <Field
            label="City codes (comma separated)"
            value={s.invoiceSettings.cities.join(", ")}
            onChange={(v) => {
              void mutate((w) => {
                w.invoiceSettings.cities = [
                  ...new Set(
                    v
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  ),
                ];
              }).catch(() => {});
            }}
          />
        </Fold>
      </>
    );
  let total = "Complete the rows to calculate";
  try {
    total = money(calculateInvoice(inv).total);
  } catch {}
  const choices = tripChoices(
      s,
      inv.dateFrom || "0000-01-01",
      inv.dateTo || "9999-12-31",
    ),
    tripOptions: Array<[string, string]> = [
      ["", "Choose a diary change"],
      ...choices.map(
        (c) =>
          [
            c.key,
            `${displayDate(c.date)} ${hhmm(c.slot)} · ${c.location} · ${c.odometer} · ${c.vehicle}`,
          ] as [string, string],
      ),
    ];
  return (
    <>
      <div className="row wrap">
        <Action onClick={() => setSelected("")}>‹ Invoices</Action>
        <Action
          onClick={async () => {
            let id = "";
            await mutate((w) => {
              const original = w.invoices.find((i) => i.id === selected)!,
                next = newInvoice(w);
              Object.assign(next, {
                nameSg: original.nameSg,
                billTo: original.billTo,
                mobile: original.mobile,
                email: original.email,
                bsb: original.bsb,
                accountNo: original.accountNo,
                abnAcn: original.abnAcn,
                loads: original.loads.map((r) => ({
                  ...clone(r),
                  id: uid(),
                  sourceId: undefined,
                  sourceRevision: undefined,
                })),
                misc: original.misc.map((r) => ({ ...clone(r), id: uid() })),
                notes: original.notes,
              });
              id = next.id;
              w.invoices.push(next);
              w.invoiceSettings.nextInvoiceNo++;
            });
            setSelected(id);
          }}
        >
          Duplicate
        </Action>
        <h1>Invoice {inv.invoiceNo}</h1>
        <span className="status">
          {inv.status} · r{inv.revision}
        </span>
      </div>
      <section className="card">
        <div className="fields">
          {[
            ["invoiceNo", "Invoice number", "text"],
            ["dateFrom", "Date from", "date"],
            ["dateTo", "Date to", "date"],
          ].map(([k, label, type]) => (
            <Field
              key={k}
              label={label}
              type={type}
              value={inv[k]}
              disabled={locked}
              onChange={(v) => {
                void edit((i) => {
                  i[k] = v;
                }).catch(() => {});
              }}
            />
          ))}
        </div>
      </section>
      <details
        className="card fold"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
      >
        <summary>Business, customer & bank details</summary>
        <div className="fold-content">
          <div className="fields">
            {[
              ["nameSg", "Name / SG No."],
              ["billTo", "Bill to"],
              ["mobile", "Mobile"],
              ["email", "Email"],
              ["bsb", "BSB"],
              ["accountNo", "Account number"],
              ["abnAcn", "ABN / ACN"],
              ["yellowDate", "Yellow pages submitted to"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                type={k === "yellowDate" ? "date" : "text"}
                value={inv[k]}
                disabled={locked}
                onChange={(v) => {
                  void edit((i) => {
                    i[k] = v;
                  }).catch(() => {});
                }}
              />
            ))}
          </div>
          <Action
            disabled={locked}
            onClick={async () => {
              await mutate((w) => {
                for (const k of [
                  "nameSg",
                  "mobile",
                  "email",
                  "bsb",
                  "accountNo",
                  "abnAcn",
                  "billTo",
                ])
                  w.invoiceSettings.profile[k] = String(
                    w.invoices.find((i) => i.id === selected)![k] || "",
                  );
              });
              setDetailsOpen(false);
            }}
          >
            Save as defaults
          </Action>
          <p className="small">
            Saved details are filled automatically for new invoices.
          </p>
        </div>
      </details>
      <section className="card invoice-section">
        <div className="row">
          <h2>Load Details</h2>
          <Action disabled={locked} onClick={() => setTrip(true)}>
            + From diary
          </Action>
        </div>
        <p className="small table-hint">Swipe across to see all columns.</p>
        <div
          className="table-scroll"
          role="region"
          aria-label="Load details table"
          tabIndex={0}
        >
          <table className="edit-table load-table">
            <thead>
              <tr>
                {[
                  "Load date",
                  "From",
                  "To",
                  "BD / RT / BT / AB / C/O",
                  "Start odometer",
                  "Finish odometer",
                  "Quantity / km",
                  "Rate",
                  "Amount",
                  "Action",
                ].map((x) => (
                  <th key={x} scope="col">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.loads.map((r, n) => (
                <tr key={r.id} aria-label={`Load ${n + 1}`}>
                  {[
                    ["loadDate", "Load date", "date"],
                    ["from", "From", "text"],
                    ["to", "To", "text"],
                    ["type", "BD / RT / BT / AB / C/O", "text"],
                    ["odoStart", "Start odometer", "number"],
                    ["odoFinish", "Finish odometer", "number"],
                    ["km", "Quantity / km", "number"],
                    [
                      "rate",
                      isCO(r.type) ? "Fixed amount" : "Rate per km",
                      "text",
                    ],
                  ].map(([k, label, type]) => (
                    <td key={k}>
                      <Field
                        label={label}
                        type={type}
                        list={
                          k === "type"
                            ? "load-types"
                            : ["from", "to"].includes(k)
                              ? "city-codes"
                              : undefined
                        }
                        value={r[k]}
                        disabled={
                          locked ||
                          (k === "km" && !!r.odoStart && !!r.odoFinish)
                        }
                        onChange={(v) => {
                          void rowEdit(r.id, k, v).catch(() => {});
                        }}
                      />
                      {k === "rate" && isCO(r.type) && (
                        <small className="fixed-rate">FIXED RATE</small>
                      )}
                      {k === "loadDate" && r.sourceId && (
                        <small className="source-note">
                          {(() => {
                            try {
                              const [a, b] = r.sourceId!.split("|");
                              return tripLoad(s, a, b).sourceRevision !==
                                r.sourceRevision
                                ? "Diary changed · review"
                                : "From diary";
                            } catch {
                              return "Source needs review";
                            }
                          })()}
                        </small>
                      )}
                    </td>
                  ))}
                  <td className="amount-cell">
                    {r.manualAmount ? (
                      <Field
                        label="Amount"
                        value={r.amount}
                        disabled={locked}
                        onChange={(v) => {
                          void rowEdit(r.id, "amount", v).catch(() => {});
                        }}
                      />
                    ) : (
                      <strong>
                        {(() => {
                          try {
                            return money(Number(calculateLoad(r).amount));
                          } catch {
                            return "—";
                          }
                        })()}
                      </strong>
                    )}
                    <Check
                      label="Manual amount"
                      value={r.manualAmount}
                      disabled={locked}
                      onChange={(v) => {
                        void rowEdit(r.id, "manualAmount", v).catch(() => {});
                      }}
                    />
                  </td>
                  <td>
                    <Action
                      disabled={locked}
                      danger
                      onClick={() =>
                        edit((i) => {
                          i.loads = i.loads.filter((x) => x.id !== r.id);
                        })
                      }
                    >
                      Remove
                    </Action>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Action
          disabled={locked}
          onClick={() =>
            edit((i) => {
              i.loads.push(blankLoad());
            })
          }
        >
          + Add load
        </Action>
      </section>
      <Fold
        title={`Miscellaneous · ${inv.misc.length} rows`}
        open={inv.misc.length > 0}
      >
        <div
          className="table-scroll"
          role="region"
          aria-label="Miscellaneous table"
          tabIndex={0}
        >
          <table className="edit-table misc-table">
            <thead>
              <tr>
                {["Date", "Item", "Quantity", "Rate", "Amount", "Action"].map(
                  (x) => (
                    <th key={x} scope="col">
                      {x}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {inv.misc.map((r, n) => (
                <tr key={r.id} aria-label={`Miscellaneous ${n + 1}`}>
                  {[
                    ["date", "Date"],
                    ["item", "Item"],
                    ["quantity", "Quantity"],
                    ["rate", "Rate"],
                  ].map(([k, label]) => (
                    <td key={k}>
                      <Field
                        label={label}
                        type={k === "date" ? "date" : "text"}
                        value={r[k]}
                        list={k === "item" ? "misc-items" : undefined}
                        disabled={locked}
                        onChange={(v) => {
                          void miscEdit(r.id, k, v).catch(() => {});
                        }}
                      />
                    </td>
                  ))}
                  <td className="amount-cell">
                    {r.manualAmount ? (
                      <Field
                        label="Miscellaneous amount"
                        value={r.amount}
                        disabled={locked}
                        onChange={(v) => {
                          void miscEdit(r.id, "amount", v).catch(() => {});
                        }}
                      />
                    ) : (
                      <strong>
                        {(() => {
                          try {
                            return money(Number(calculateMisc(r).amount));
                          } catch {
                            return "—";
                          }
                        })()}
                      </strong>
                    )}
                    <Check
                      label="Manual amount"
                      value={r.manualAmount}
                      disabled={locked}
                      onChange={(v) => {
                        void miscEdit(r.id, "manualAmount", v).catch(() => {});
                      }}
                    />
                  </td>
                  <td>
                    <Action
                      disabled={locked}
                      danger
                      onClick={() =>
                        edit((i) => {
                          i.misc = i.misc.filter((x) => x.id !== r.id);
                        })
                      }
                    >
                      Remove
                    </Action>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Action
          disabled={locked}
          onClick={() =>
            edit((i) => {
              i.misc.push(blankMisc());
            })
          }
        >
          + Add miscellaneous
        </Action>
      </Fold>
      <section className="card">
        <Field
          label="Notes"
          type="textarea"
          value={inv.notes}
          disabled={locked}
          onChange={(v) => {
            void edit((i) => {
              i.notes = v;
            }).catch(() => {});
          }}
        />
        <div className="row">
          <strong className="invoice-total">{total}</strong>
          <Action primary onClick={preview}>
            Preview PDF
          </Action>
        </div>
        <div className="row wrap">
          <Action
            onClick={async () => {
              const w = await latest();
              download(
                new Blob(
                  [
                    "\ufeff" +
                      invoiceCsv(w.invoices.find((i) => i.id === selected)!),
                  ],
                  { type: "text/csv;charset=utf-8" },
                ),
                "Invoice-" + inv.invoiceNo + ".csv",
              );
            }}
          >
            CSV
          </Action>
          <Action
            onClick={async () => {
              const w = await latest(),
                i = w.invoices.find((i) => i.id === selected)!;
              const { invoiceExcel } = await import("../documents/excel");
              download(
                new Blob([invoiceExcel(i)], {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
                "Invoice-" +
                  i.invoiceNo +
                  "-" +
                  i.dateFrom +
                  "-" +
                  i.dateTo +
                  ".xlsx",
              );
            }}
          >
            Excel
          </Action>
          {locked ? (
            <Action
              onClick={async () => {
                let id = "";
                await mutate((w) => {
                  const old = w.invoices.find((i) => i.id === selected)!,
                    next = clone(old);
                  next.id = uid();
                  id = next.id;
                  next.status = "Draft";
                  next.revision++;
                  next.revises = old.id;
                  next.updatedAt = new Date().toISOString();
                  w.invoices.push(next);
                  audit(w, "Revise invoice", next.id, old, next);
                });
                setSelected(id);
              }}
            >
              Create revision
            </Action>
          ) : (
            <>
              <Action
                onClick={() =>
                  mutate((w) => {
                    const i = w.invoices.find((i) => i.id === selected)!;
                    const calculated = validateInvoice(i).invoice;
                    if (
                      w.invoices.some(
                        (x) =>
                          x.id !== i.id &&
                          x.invoiceNo === i.invoiceNo &&
                          x.status === "Issued" &&
                          i.revises !== x.id,
                      )
                    )
                      throw Error("This number has already been issued.");
                    Object.assign(i, calculated, { status: "Issued" });
                    for (const r of i.loads) {
                      if (r.type && !w.invoiceSettings.types.includes(r.type))
                        w.invoiceSettings.types.push(r.type);
                      if (r.type && r.rate)
                        w.invoiceSettings.typeRates[r.type] = r.rate;
                    }
                    for (const r of i.misc) {
                      if (
                        r.item &&
                        !w.invoiceSettings.miscItems.includes(r.item)
                      )
                        w.invoiceSettings.miscItems.push(r.item);
                      if (r.item && r.rate)
                        w.invoiceSettings.miscItemRates[r.item] = r.rate;
                    }
                    audit(w, "Issue invoice", i.id, undefined, i);
                  })
                }
              >
                Mark issued
              </Action>
              <Action danger onClick={() => setDeleteId(inv.id)}>
                Delete draft
              </Action>
            </>
          )}
        </div>
      </section>
      <datalist id="load-types">
        {s.invoiceSettings.types.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="city-codes">
        {s.invoiceSettings.cities.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="misc-items">
        {s.invoiceSettings.miscItems.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      {trip && (
        <Modal title="Add a diary trip" onClose={() => setTrip(false)}>
          <Field
            label="Start change"
            value={start}
            options={tripOptions}
            onChange={setStart}
          />
          <Field
            label="Finish change"
            value={finish}
            options={tripOptions}
            onChange={setFinish}
          />
          <Action
            primary
            onClick={async () => {
              await mutate((w) => {
                const row = tripLoad(w, start, finish),
                  i = w.invoices.find((x) => x.id === selected)!;
                if (
                  w.invoices.some(
                    (x) =>
                      x.id !== i.revises &&
                      x.loads.some((r) => r.sourceId === row.sourceId),
                  )
                )
                  throw Error("This diary trip is already on an invoice.");
                i.loads = i.loads.filter(activeLoad);
                i.loads.push(row);
              });
              setTrip(false);
            }}
          >
            Add trip for review
          </Action>
        </Modal>
      )}
      {deleteId && (
        <Modal title="Delete this draft?" onClose={() => setDeleteId("")}>
          <Action
            danger
            onClick={async () => {
              await mutate((w) => {
                const i = w.invoices.find((x) => x.id === deleteId);
                if (i?.status === "Issued")
                  throw Error("Issued invoices are retained.");
                audit(w, "Delete invoice draft", deleteId, i);
                w.invoices = w.invoices.filter((x) => x.id !== deleteId);
              });
              setDeleteId("");
              setSelected("");
            }}
          >
            Delete draft
          </Action>
        </Modal>
      )}
      {doc && (
        <Document
          name={
            "Invoice-" +
            doc.invoiceNo +
            "-" +
            doc.dateFrom +
            "-to-" +
            doc.dateTo
          }
          pages={invoicePages(doc)}
          close={() => setDoc(null)}
        />
      )}
    </>
  );
}
