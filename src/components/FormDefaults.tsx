import { useEffect, useState } from "react";
import { useStore } from "../context";
import { getFormDefaults, saveFormDefaults } from "../domain/forms";
import { Action, Check, Field, ImageInput } from "./UI";
import { Signature } from "./Signature";

export function FormDefaults({ onSaved }: { onSaved?: () => void }) {
  const { s, mutate } = useStore();
  const [owner] = useState(s.profile.id);
  const [defaults, setDefaults] = useState(() => getFormDefaults(s));
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const current = JSON.stringify(getFormDefaults(s));
  useEffect(() => { if (!dirty) setDefaults(JSON.parse(current)); }, [current, dirty]);
  const put = (key: keyof typeof defaults, value: string | boolean) => {
    setSaved(false); setDirty(true);
    setDefaults(d => ({ ...d, [key]: value, ...(["driver", "licence"].includes(key) ? { signature: "" } : {}) }));
  };
  return <>
    <p className="small">Used for new forms. Existing forms keep their saved details.</p>
    <h3>Company</h3>
    <Field label="Default company name" value={defaults.company} onChange={v => put("company", v)} />
    <div className="row wrap">
      <Check label="Show company name by default" value={defaults.showCompany} onChange={v => put("showCompany", v)} />
      <Check label="Show logo by default" value={defaults.showLogo} onChange={v => put("showLogo", v)} />
      <ImageInput label="Choose default logo" onChange={v => { put("logo", v); put("showLogo", true); }} />
      {defaults.logo && <Action onClick={() => { put("logo", ""); put("showLogo", false); }}>Remove logo</Action>}
    </div>
    {defaults.logo && <img src={defaults.logo} alt="Default company logo" className="brand-image" />}
    <h3>My details</h3>
    <div className="fields">
      <Field label="Default driver name" value={defaults.driver} onChange={v => put("driver", v)} />
      <Field label="Default contact number" value={defaults.contact} onChange={v => put("contact", v)} />
      <Field label="Default licence number" value={defaults.licence} onChange={v => put("licence", v)} />
      <Field label="Default licence expiry" type="date" value={defaults.expiry} onChange={v => put("expiry", v)} />
    </div>
    <h3>My form signature</h3>
    <Signature value={defaults.signature} onSave={async v => put("signature", v)} />
    <div className="row wrap">
      <Action primary onClick={async () => {
        await mutate(w => {
          if (w.profile.id !== owner) throw Error("Driver changed. Reopen Form defaults.");
          saveFormDefaults(w, defaults);
        });
        setDirty(false); setSaved(true); onSaved?.();
      }}>Save defaults</Action>
      {saved && <span role="status">Defaults saved</span>}
    </div>
  </>;
}
