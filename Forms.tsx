import { FormDefaults } from "../components/FormDefaults";
import { Signature } from "../components/Signature";
import { displayDate } from "../domain/time";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../context";
import { audit, clone, type FormRecord } from "../domain/model";
import {
  allClear,
  declarations,
  editForm,
  deleteForm,
  reviseForm,
  getFormDefaults,
  inspection,
  newForm,
  signForm,
  vehiclesInForm,
} from "../domain/forms";
import {
  Action,
  Check,
  Empty,
  Field,
  Fold,
  ImageInput,
  Modal,
} from "../components/UI";
import { Location } from "../components/Location";
import { Document } from "../components/Document";
import { formPages } from "../documents/form-pages";
export function Forms() {
  const { s, mutate, latest, busy, error } = useStore(),
    [id, setId] = useState(""),
    [defaultsOpen, setDefaultsOpen] = useState(false),
    [confirm, setConfirm] = useState<{ action: "edit" | "delete"; id: string } | null>(null),
    [vehicle, setVehicle] = useState("pm"),
    [reviewed, setReviewed] = useState(false),
    [saveSignature, setSaveSignature] = useState(false),
    [undo, setUndo] = useState<FormRecord | null>(null),
    [doc, setDoc] = useState<FormRecord | null>(null);
  const documentPages = useMemo(() => doc ? formPages(doc) : [], [doc]);
  const f = s.forms.find((f) => f.id === id),
    locked = f?.status === "Signed";
  useEffect(() => {
    setReviewed(false);
  }, [f?.id, f?.revision]);
  async function add(previous?: FormRecord) {
    let next = "";
    await mutate((w) => {
      const record = newForm(
        w,
        previous ||
          [...w.forms].reverse().find((f) => f.driverId === w.profile.id),
      );
      next = record.id;
      w.forms.push(record);
    });
    setId(next);
    setReviewed(false);
    setUndo(null);
  }
  async function edit(fn: (f: FormRecord) => void) {
    setReviewed(false);
    await mutate((w) => editForm(w, id, fn));
  }
  async function clear(part: "checks" | "declarations") {
    const state = await latest(),
      old = clone(state.forms.find((x) => x.id === id)!);
    await edit((f) => allClear(f, part));
    setUndo(old);
  }
  async function save() {
    await latest();
    await mutate(w => {
      const record = w.forms.find(x => x.id === id);
      if (!record) throw Error("Form not found.");
      record.updatedAt = new Date().toISOString();
    });
    setId(""); setUndo(null);
  }
  async function preview(recordId: string) {
    const w = await latest();
    const record = w.forms.find(x => x.id === recordId);
    if (!record) throw Error("Form not found.");
    setDoc(clone(record));
  }
  function openEdit(record: FormRecord) {
    if (record.status === "Signed") setConfirm({ action: "edit", id: record.id });
    else { setId(record.id); setUndo(null); setReviewed(false); }
  }
  const dialogs = <>
    {defaultsOpen && <Modal title="Form defaults" onClose={() => setDefaultsOpen(false)}>
      <FormDefaults key={s.profile.id} onSaved={() => setDefaultsOpen(false)} />
    </Modal>}
    {confirm && <Modal title={confirm.action === "delete" ? "Delete form?" : "Edit signed form?"} onClose={() => setConfirm(null)}>
      <p>{confirm.action === "delete" ? "This removes this saved form from the device. Download its PDF first if you need a copy." : "An editable revision will keep these trip details and answers. Review and sign it again; the original signed copy stays saved."}</p>
      <div className="row wrap">
        <Action onClick={() => setConfirm(null)}>Cancel</Action>
        <Action primary={confirm.action === "edit"} danger={confirm.action === "delete"} onClick={async () => {
          let next = "";
          await mutate(w => {
            if (confirm.action === "delete") deleteForm(w, confirm.id);
            else next = reviseForm(w, confirm.id);
          });
          setId(next); setUndo(null); setReviewed(false); setConfirm(null);
        }}>{confirm.action === "delete" ? "Delete form" : "Create editable revision"}</Action>
      </div>
    </Modal>}
    {doc && <Document name={"Safe-driving-" + doc.values.date + "-" + (doc.values.pm || "draft")}
      pages={documentPages} close={() => setDoc(null)} />}
  </>;
  if (!f)
    return (
      <>
        <div className="row wrap">
          <h1>Safe driving & daily check</h1>
          <div className="row wrap">
            <Action onClick={() => setDefaultsOpen(true)}>Form defaults</Action>
            <Action primary onClick={() => add()}>+ New form</Action>
          </div>
        </div>
        {[...s.forms].reverse().map(record => (
          <section className="card form-record" key={record.id} aria-label={`Form ${displayDate(record.values.date)} ${record.values.pm || "Draft"}`}>
            <button className="list-button form-record-open" onClick={() => { setId(record.id); setReviewed(false); setUndo(null); }}>
              <span><b>{displayDate(record.values.date)} · {record.values.pm || "Truck not set"}</b>
                <small>{record.values.from || "Origin"} → {record.values.to || "Destination"}</small></span>
              <span>{record.status}{record.revises ? " · Revision" : ""}</span>
            </button>
            <div className="form-record-actions">
              <Action onClick={() => openEdit(record)}>Edit</Action>
              <Action onClick={() => preview(record.id)}>Share / PDF</Action>
              <Action danger onClick={() => setConfirm({ action: "delete", id: record.id })}>Delete</Action>
            </div>
          </section>
        ))}
        {dialogs}
        {!s.forms.length && (
          <Empty>
            Your driver details and vehicles will be remembered for the next
            trip.
          </Empty>
        )}
      </>
    );
  const set = (key: string, v: string) =>
    edit((f) => {
      f.values[key] = v;
    });
  const count = vehiclesInForm(f).reduce(
      (n, k) => n + Object.keys(f.checks[k] || {}).length,
      0,
    ),
    max = vehiclesInForm(f).length * inspection.length;
  return (
    <>
      <div className="row wrap">
        <Action onClick={() => setId("")}>‹ Forms</Action>
        <h1>Safe driving plan</h1>
        <span className="status">
          {f.status} · {f.values.base || s.profile.base} time
        </span>
      </div>
      <section className="card">
        <div className="fields">
          <Location
            value={f.values.from || ""}
            disabled={locked}
            onChange={(v) => {
              void set("from", v).catch(() => {});
            }}
          />
          <Field
            label="Destination"
            value={f.values.to}
            disabled={locked}
            onChange={(v) => {
              void set("to", v).catch(() => {});
            }}
          />
          {[
            ["date", "Departure date", "date"],
            ["depart", "Departure time", "time"],
            ["arrive", "Estimated arrival", "datetime-local"],
            ["hours", "Hours available", "number"],
            ["pm", "Truck registration", "text"],
            ["odo", "Odometer", "number"],
          ].map(([k, label, type]) => (
            <Field
              key={k}
              label={label}
              value={f.values[k]}
              disabled={locked}
              type={type}
              list={k === "pm" ? "vehicles" : undefined}
              onChange={(v) => {
                void set(k, v).catch(() => {});
              }}
            />
          ))}
        </div>
      </section>
      <Fold title="Driver, trailers & load">
        <div className="fields">
          {[
            ["driver", "Driver name"],
            ["contact", "Contact"],
            ["licence", "Licence"],
            ["expiry", "Licence expiry"],
            ["t1", "Trailer 1"],
            ["t2", "Trailer 2"],
            ["t3", "Trailer 3"],
            ["scheme", "Work / rest scheme"],
            ["accreditation", "Accreditation number"],
            ["vehicle-type", "Vehicle type"],
            ["manifest", "Manifest number"],
            ["weight-steer", "Steer weight"],
            ["weight-drive", "Drive weight"],
            ["weight-1", "Trailer 1 weight"],
            ["weight-2", "Trailer 2 weight"],
            ["weight-3", "Trailer 3 weight"],
          ].map(([k, label]) => (
            <Field
              key={k}
              label={label}
              type={k === "expiry" ? "date" : "text"}
              value={f.values[k]}
              disabled={locked}
              options={
                k === "scheme" ? ["Standard", "BFM", "AFM", "ACH"] : undefined
              }
              onChange={(v) => {
                void set(k, v).catch(() => {});
              }}
            />
          ))}
        </div>
        {["AFM", "ACH"].includes(f.values.scheme) && (
          <p className="banner">
            This company template only has Standard and BFM boxes. Record your
            certificate arrangement in Comments and confirm the company accepts
            it.
          </p>
        )}
      </Fold>
      <section className="card">
        <div className="row wrap">
          <h2>
            Vehicle check{" "}
            <small>
              {count}/{max}
            </small>
          </h2>
          <Action disabled={locked} onClick={() => clear("checks")}>
            All checked · OK
          </Action>
        </div>
        <Field
          label="Inspect vehicle"
          value={
            vehiclesInForm(f).includes(vehicle)
              ? vehicle
              : vehiclesInForm(f)[0] || "pm"
          }
          options={(vehiclesInForm(f).length ? vehiclesInForm(f) : ["pm"]).map(
            (k) => [
              k,
              `${k === "pm" ? "Truck" : k.replace("t", "Trailer ")} · ${f.values[k] || "not set"}`,
            ],
          )}
          onChange={setVehicle}
        />
        {inspection.map((q, i) => {
          const key = vehiclesInForm(f).includes(vehicle)
            ? vehicle
            : vehiclesInForm(f)[0] || "pm";
          return (
            <div className="question" key={i}>
              <span>
                {i + 1}. {q}
              </span>
              <div className="answers" role="group" aria-label={q}>
                {[
                  ["ok", "OK"],
                  ["issue", "Fault"],
                  ["na", "N/A"],
                ].map(([a, label]) => (
                  <button
                    disabled={locked}
                    key={a}
                    aria-pressed={f.checks[key]?.[i] === a}
                    onClick={() => {
                      void edit((f) => {
                        f.checks[key] ||= {};
                        f.checks[key][i] = a;
                      }).catch(() => {});
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <Fold
        title={`Driver declarations · ${Object.keys(f.declarations).length}/${declarations.length}`}
        open
      >
        <Action disabled={locked} onClick={() => clear("declarations")}>
          Reviewed all · all clear
        </Action>
        {declarations.map(([q], i) => (
          <div className="question" key={i}>
            <span>
              {i + 1}. {q}
            </span>
            <div className="answers" role="group" aria-label={q}>
              {["Yes", "No"].map((a) => (
                <button
                  key={a}
                  disabled={locked}
                  aria-pressed={f.declarations[i] === a}
                  onClick={() => {
                    void edit((f) => {
                      f.declarations[i] = a;
                    }).catch(() => {});
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Fold>
      {undo && !locked && (
        <Action
          onClick={async () => {
            await mutate((w) => {
              const index = w.forms.findIndex((x) => x.id === id);
              if (index >= 0) w.forms[index] = clone(undo);
            });
            setUndo(null);
            setReviewed(false);
          }}
        >
          Undo last all-clear action
        </Action>
      )}
      <section className="card">
        <Field
          label="Comments / faults and action taken"
          type="textarea"
          value={f.values.comments}
          disabled={locked}
          onChange={(v) => {
            void set("comments", v).catch(() => {});
          }}
        />
      </section>
      <Fold title="Company name & logo (this form)">
        <Field
          label="Company name"
          value={f.company}
          disabled={locked}
          onChange={(v) => {
            void edit((f) => {
              f.company = v;
            }).catch(() => {});
          }}
        />
        <div className="row wrap">
          <Check
            label="Show company name"
            value={f.showCompany}
            disabled={locked}
            onChange={(v) => {
              void edit((f) => {
                f.showCompany = v;
              }).catch(() => {});
            }}
          />
          <Check
            label="Show logo"
            value={f.showLogo}
            disabled={locked}
            onChange={(v) => {
              void edit((f) => {
                f.showLogo = v;
              }).catch(() => {});
            }}
          />
          {!locked && (
            <ImageInput
              label="Choose logo"
              onChange={(v) => {
                void edit((f) => {
                  f.logo = v;
                  f.showLogo = true;
                }).catch(() => {});
              }}
            />
          )}
        </div>
        {f.logo && f.showLogo && (
          <img src={f.logo} alt="Company logo" className="brand-image" />
        )}
      </Fold>
      <section className="card">
        <h2>Review & signature</h2>
        {locked ? (
          <>
            <p>Signed by {f.signedName}. This saved form is read only.</p>
            <Action onClick={() => openEdit(f)}>Edit form</Action>
            <Action onClick={() => add(f)}>New trip from this form</Action>
          </>
        ) : (
          <>
            <Check
              label="I have reviewed this form and these answers for this trip"
              value={reviewed}
              onChange={setReviewed}
            />
            <Action
              disabled={!reviewed || !getFormDefaults(s).signature}
              onClick={() =>
                mutate((w) => {
                  const record = w.forms.find((x) => x.id === id)!;
                  if (record.revision !== f.revision)
                    throw Error(
                      "This form changed. Review it again before signing.",
                    );
                  signForm(record, w);
                  audit(w, "Sign driving form", id, undefined, record);
                })
              }
            >
              Apply my saved signature
            </Action>
            {reviewed && (
              <div className="form-signature">
                <Signature
                  value=""
                  drawLabel="Sign now"
                  saveLabel="Sign this form"
                  onSave={async (signature) => {
                    await mutate((w) => {
                      const record = w.forms.find((x) => x.id === id)!;
                      if (record.revision !== f.revision)
                        throw Error(
                          "This form changed. Review it again before signing.",
                        );
                      signForm(record, w, signature);
                      if (saveSignature) {
                        if (w.formDefaults?.[w.profile.id]) w.formDefaults[w.profile.id].signature = signature;
                        else w.profile.signature = signature;
                      }
                      audit(w, "Sign driving form", id, undefined, record);
                    });
                  }}
                />
                <Check
                  label="Save this signature for future forms"
                  value={saveSignature}
                  onChange={setSaveSignature}
                />
              </div>
            )}
            {!reviewed && (
              <p className="small">
                Review this trip to sign now or use your saved signature.
              </p>
            )}
          </>
        )}
        <div className="row">
          <Action
            primary
            onClick={async () => {
              const w = await latest();
              setDoc(clone(w.forms.find((x) => x.id === id)!));
            }}
          >
            Preview / export PDF
          </Action>
        </div>
      </section>
      <div className="form-save-bar">
        <span role="status">{busy ? "Saving…" : error ? "Check save error" : "Saved on this device"}</span>
        <div className="row wrap">
          <Action onClick={() => preview(f.id)}>Share / PDF</Action>
          <Action primary disabled={busy || !!error} onClick={save}>Save form</Action>
        </div>
      </div>
      {dialogs}
    </>
  );
}
