import { useState } from "react";
import { useStore } from "../context";
import {
  audit,
  clone,
  emptyProfile,
  uid,
  zones,
  type Profile,
} from "../domain/model";
import { today, validDate } from "../domain/time";
import {
  Action,
  Check,
  Field,
  Fold,
  ImageInput,
  Modal,
} from "../components/UI";
import { Signature } from "../components/Signature";
export function Settings({ onDone }: { onDone?: () => void }) {
  const { s, mutate } = useStore(),
    [p, setP] = useState<Profile>(clone(s.profile)),
    [newDriver, setNewDriver] = useState(false),
    [registry, setRegistry] = useState(""),
    [registryId, setRegistryId] = useState(""),
    [name, setName] = useState(""),
    [details, setDetails] = useState(""),
    [mapPlace, setMapPlace] = useState(""),
    [mapCity, setMapCity] = useState("");
  const put = (k: keyof Profile, v: unknown) => setP((a) => ({ ...a, [k]: v }));
  async function save() {
    if (!p.name.trim() || !p.licence.trim())
      throw Error("Enter your name and licence.");
    const date = p.effectiveFrom || today(p.zone);
    if (!validDate(date)) throw Error("Choose the effective date.");
    await mutate((w) => {
      if (
        w.timer &&
        (w.profile.id !== p.id ||
          w.profile.zone !== p.zone ||
          w.profile.scheme !== p.scheme)
      )
        throw Error(
          "Finish the active timer before changing driver, time zone or scheme.",
        );
      const old = clone(w.profile);
      if (old.name) {
        const index = w.profileHistory.findIndex(
          (x) => x.id === old.id && x.effectiveFrom === old.effectiveFrom,
        );
        if (index >= 0) w.profileHistory[index] = old;
        else w.profileHistory.push(old);
      }
      w.profile = { ...clone(p), effectiveFrom: date };
      w.onboarded = true;
      const existing = w.registry.find(
        (r) => r.type === "driver" && r.id === p.id,
      );
      const record = {
        id: p.id,
        type: "driver" as const,
        name: p.name,
        details: { profile: JSON.stringify(w.profile) },
      };
      if (existing) Object.assign(existing, record);
      else w.registry.push(record);
      audit(w, "Save driver settings", p.id, old, w.profile);
    });
    void navigator.storage?.persist?.().catch(() => {});
    onDone?.();
  }
  return (
    <>
      <h1>{s.onboarded ? "Settings" : "Welcome to Truck Workspace"}</h1>
      <section className="card">
        <div className="row">
          <h2>Driver profile</h2>
          {s.onboarded && (
            <Action onClick={() => setNewDriver(true)}>
              Switch / add driver
            </Action>
          )}
        </div>
        <div className="fields">
          {[
            ["name", "Driver name"],
            ["licence", "Licence number"],
            ["licenceExpiry", "Licence expiry"],
            ["contact", "Mobile"],
            ["effectiveFrom", "Effective from"],
          ].map(([k, label]) => (
            <Field
              key={k}
              label={label}
              type={
                k === "licenceExpiry" || k === "effectiveFrom" ? "date" : "text"
              }
              value={p[k]}
              onChange={(v) => put(k, v)}
            />
          ))}
          <Field
            label="Driver base"
            value={p.base}
            options={Object.keys(zones)}
            onChange={(v) => setP((a) => ({ ...a, base: v, zone: zones[v] }))}
          />
          <Field
            label="Scheme"
            value={p.scheme}
            options={["Standard", "BFM", "AFM", "ACH"]}
            onChange={(v) => put("scheme", v)}
          />
        </div>
        <Check
          label="Two-up operation"
          value={p.twoUp}
          onChange={(v) => put("twoUp", v)}
        />
        {p.twoUp && (
          <div className="fields">
            {[
              ["coDriver", "Co-driver"],
              ["coLicence", "Co-driver licence"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={p[k]}
                onChange={(v) => put(k, v)}
              />
            ))}
            <Field
              label="Co-driver scheme"
              value={p.coScheme}
              options={["Standard", "BFM", "AFM", "ACH"]}
              onChange={(v) => put("coScheme", v)}
            />
            <Field
              label="Co-driver base"
              value={p.coBase}
              options={["", ...Object.keys(zones)]}
              onChange={(v) => put("coBase", v)}
            />
          </div>
        )}
        {p.scheme !== "Standard" && (
          <div className="fields">
            <Field
              label="Accreditation / certificate"
              value={p.certificate}
              onChange={(v) => put("certificate", v)}
            />
            <Field
              label="Certificate expiry"
              type="date"
              value={p.certificateExpiry}
              onChange={(v) => put("certificateExpiry", v)}
            />
          </div>
        )}
        <Fold title="Operator & record keeper">
          <div className="fields">
            {[
              ["operator", "Operator / company"],
              ["recordKeeper", "Record keeper"],
              ["recordAddress", "Record keeper address"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={p[k]}
                onChange={(v) => put(k, v)}
              />
            ))}
          </div>
          <ImageInput
            label="Choose company logo"
            onChange={(v) => put("logo", v)}
          />
        </Fold>
        <Action primary onClick={save}>
          Save driver settings
        </Action>
      </section>
      {s.onboarded && (
        <>
          <Fold title="My reusable signature">
            <p className="small">
              Signature belongs to {s.profile.name}. Each form requires a fresh
              review.
            </p>
            <Signature
              value={s.profile.signature}
              onSave={(data) =>
                mutate((w) => {
                  w.profile.signature = data;
                  setP((p) => ({ ...p, signature: data }));
                  audit(w, "Save reusable signature", w.profile.id);
                })
              }
            />
          </Fold>
          <Fold title="Vehicles & drivers">
            <div className="row wrap">
              <Action
                onClick={() => {
                  setRegistry("vehicle");
                  setRegistryId("");
                  setName("");
                  setDetails("");
                }}
              >
                + Vehicle
              </Action>
              <Action onClick={() => setNewDriver(true)}>+ Driver</Action>
            </div>
            {s.registry.map((r) => (
              <div className="record-line" key={r.id}>
                <strong>{r.name}</strong>
                <span>{r.type}</span>
                <small>
                  {r.type === "vehicle"
                    ? r.details.notes || r.details.make || ""
                    : ""}
                </small>
                {r.type === "vehicle" && (
                  <Action
                    onClick={() => {
                      setRegistryId(r.id);
                      setRegistry("vehicle");
                      setName(r.name);
                      setDetails(r.details.notes || "");
                    }}
                  >
                    Edit
                  </Action>
                )}
              </div>
            ))}
          </Fold>
          <Fold title="Display & diary">
            <Field
              label="Theme"
              value={s.settings.theme}
              options={[["system", "Auto · follow device"], ["light", "Day · light"], ["dark", "Night · dark"]]}
              onChange={(v) => {
                void mutate((w) => {
                  w.settings.theme = v as typeof w.settings.theme;
                }).catch(() => {});
              }}
            />
            <Check
              label="Show location picker"
              value={s.settings.locationPicker}
              onChange={(v) => {
                void mutate((w) => {
                  w.settings.locationPicker = v;
                }).catch(() => {});
              }}
            />
            <Check
              label="Automatically allocate the next paper page"
              value={s.settings.autoPages}
              onChange={(v) => {
                void mutate((w) => {
                  w.settings.autoPages = v;
                }).catch(() => {});
              }}
            />
            <Field
              label="Backup reminder"
              value={s.settings.backupDays}
              options={[
                ["0", "Off"],
                ["1", "Daily"],
                ["7", "Weekly"],
                ["30", "Monthly"],
              ]}
              onChange={(v) => {
                void mutate((w) => {
                  w.settings.backupDays = Number(v);
                }).catch(() => {});
              }}
            />
          </Fold>
          <Fold title="Suburb → invoice city code">
            <div className="fields">
              <Field
                label="Suburb / town"
                value={mapPlace}
                onChange={setMapPlace}
              />
              <Field label="City code" value={mapCity} onChange={setMapCity} />
            </div>
            <Action
              onClick={async () => {
                if (!mapPlace.trim() || !mapCity.trim())
                  throw Error("Enter both a place and city code.");
                await mutate((w) => {
                  w.routeMap[mapPlace.trim().toLowerCase()] = mapCity
                    .trim()
                    .toUpperCase();
                });
                setMapPlace("");
                setMapCity("");
              }}
            >
              Save mapping
            </Action>
            {Object.entries(s.routeMap).map(([place, city]) => (
              <div className="record-line" key={place}>
                <span>{place}</span>
                <b>{city}</b>
                <Action
                  onClick={() =>
                    mutate((w) => {
                      delete w.routeMap[place];
                    })
                  }
                >
                  Remove
                </Action>
              </div>
            ))}
          </Fold>
          <Fold title="Profile & rule history">
            {[...s.profileHistory, s.profile]
              .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
              .map((p, i) => (
                <div className="record-line" key={i}>
                  <span>{p.effectiveFrom || "Earlier"}</span>
                  <span>
                    {p.name} · {p.scheme} · {p.twoUp ? "Two-up" : "Solo"} ·{" "}
                    {p.base}
                  </span>
                </div>
              ))}
          </Fold>
          <Fold title="About & privacy">
            <p>
              Version 2.0 beta. Records stay in this browser on this device.
              Browser storage can be cleared by the device; export backups for
              long-term keeping.
            </p>
            <p>
              This personal record app is not an NHVR-approved EWD. Use your
              required written work diary or approved EWD. Hours guidance needs
              complete history and correct rest classification. AFM and ACH are
              record-only.
            </p>
            <p>
              Only an explicit location lookup sends your current coordinates to
              BigDataCloud. Notes, signatures, invoices and diary records are
              not sent to a server.
            </p>
            <a
              href="https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management"
              target="_blank"
              rel="noreferrer"
            >
              NHVR guidance
            </a>
          </Fold>
        </>
      )}
      {newDriver && (
        <Modal title="Choose a driver" onClose={() => setNewDriver(false)}>
          {s.registry
            .filter((r) => r.type === "driver")
            .map((r) => (
              <Action
                key={r.id}
                onClick={() => {
                  let profile;
                  try {
                    profile = JSON.parse(r.details.profile);
                  } catch {
                    profile = {
                      ...emptyProfile(),
                      ...r.details,
                      name: r.name,
                      id: r.id,
                    };
                  }
                  setP({
                    ...emptyProfile(),
                    ...profile,
                    effectiveFrom: today(s.profile.zone),
                  });
                  setNewDriver(false);
                }}
              >
                {r.name}
              </Action>
            ))}
          <Action
            primary
            onClick={() => {
              setP({ ...emptyProfile(), effectiveFrom: today(s.profile.zone) });
              setNewDriver(false);
            }}
          >
            New driver
          </Action>
        </Modal>
      )}
      {registry && (
        <Modal
          title={registryId ? "Edit vehicle" : "Add vehicle"}
          onClose={() => setRegistry("")}
        >
          <Field label="Registration" value={name} onChange={setName} />
          <Field
            label="Make, model / notes"
            type="textarea"
            value={details}
            onChange={setDetails}
          />
          <Action
            primary
            onClick={async () => {
              if (!name.trim()) throw Error("Enter a registration.");
              await mutate((w) => {
                if (
                  w.registry.some(
                    (r) =>
                      r.type === "vehicle" &&
                      r.id !== registryId &&
                      r.name.toLowerCase() === name.trim().toLowerCase(),
                  )
                )
                  throw Error("Vehicle already exists.");
                const old = w.registry.find((r) => r.id === registryId);
                if (old) {
                  const before = clone(old);
                  old.name = name.trim().toUpperCase();
                  old.details.notes = details;
                  audit(w, "Edit vehicle", old.id, before, old);
                } else
                  w.registry.push({
                    id: uid(),
                    name: name.trim().toUpperCase(),
                    type: "vehicle",
                    details: { notes: details },
                  });
              });
              setRegistry("");
            }}
          >
            Save vehicle
          </Action>
        </Modal>
      )}
    </>
  );
}
