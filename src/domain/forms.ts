import { audit, clone, uid, type FormDefaults, type FormRecord, type Workspace } from "./model";
import { today, validDate } from "./time";
export const inspection = [
  "Engine oil, coolant, windscreen fluid and fluid / air leaks.",
  "Wipers and washers.",
  "Headlights, driving, park and clearance lights.",
  "Indicators, hazards, tail, plate and brake lights.",
  "Tyres and wheel security.",
  "Coupling, air hoses and electrical cables.",
  "Tow couplings and drawbars.",
  "Lights, reflectors and lenses.",
  "Body panels and structural members.",
  "Mud flaps and guards.",
  "Windows and mirrors.",
  "Number plates, labels and interception book.",
  "Fuel tanks.",
  "Brake indicators, gauges and air tanks.",
  "Brake components.",
];
export const declarations = [
  ["My work diary is completed in accordance with regulations.", "Yes"],
  [
    "I will account for available work time if this task extends beyond 24 hours.",
    "Yes",
  ],
  ["I have taken the required rest and am fit for this trip.", "Yes"],
  ["I have considered night driving risks and suitable rest areas.", "Yes"],
  ["I am appropriately licensed for this load.", "Yes"],
  ["I am free of drugs and alcohol; my blood alcohol level is zero.", "Yes"],
  [
    "Are there any vehicle faults or concerns, including windscreen cracks?",
    "No",
  ],
  ["Are there unusual noises or obvious lighting faults?", "No"],
  ["Is there sufficient tyre tread?", "Yes"],
  [
    "The vehicle has no modification permitting speeding; I will observe speed limits.",
    "Yes",
  ],
  ["I am satisfied with the vehicle condition.", "Yes"],
  ["The load will be adequately restrained in every direction.", "Yes"],
  ["I will report unscheduled rest, failures, hazards and incidents.", "Yes"],
  [
    "My licence and work diary are current. I have completed the inspection to the limits of my ability.",
    "Yes",
  ],
  ["I have sufficient rest and work time for the task.", "Yes"],
  ["I understand fatigue and declare myself fit for work.", "Yes"],
  [
    "I have assessed my fitness and am not under the influence of drugs or alcohol.",
    "Yes",
  ],
  ["Load security complies with the Load Restraint Guide.", "Yes"],
  ["Required PPE is available and in good condition.", "Yes"],
  ["Load restraint equipment is available and serviceable.", "Yes"],
  ["I have checked the dimensions and load security.", "Yes"],
];
export const vehicleKeys = ["pm", "t1", "t2", "t3"];
export const vehiclesInForm = (f: FormRecord) =>
  vehicleKeys.filter((k) => f.values[k]?.trim());
export function getFormDefaults(s: Workspace): FormDefaults {
  const p = s.profile;
  const previous = [...s.forms].reverse().find(f => f.driverId === p.id);
  return clone(s.formDefaults?.[p.id] ?? {
    driver: p.name, contact: p.contact, licence: p.licence, expiry: p.licenceExpiry,
    company: previous?.company ?? p.operator, logo: previous?.logo ?? p.logo,
    showCompany: previous?.showCompany ?? !!p.operator,
    showLogo: previous?.showLogo ?? !!p.logo, signature: p.signature,
  });
}
export function saveFormDefaults(s: Workspace, defaults: FormDefaults) {
  if (!defaults.driver.trim() || !defaults.licence.trim())
    throw Error("Enter your driver name and licence number.");
  const before = getFormDefaults(s), next = clone(defaults);
  if ((before.driver !== next.driver || before.licence !== next.licence) && next.signature === before.signature) next.signature = "";
  s.formDefaults ||= {};
  s.formDefaults[s.profile.id] = next;
  audit(s, "Save form defaults", s.profile.id, before, next);
}
export function reviseForm(s: Workspace, id: string) {
  const original = s.forms.find(f => f.id === id);
  if (!original) throw Error("Form not found.");
  if (original.status !== "Signed") return original.id;
  const revision = clone(original);
  revision.id = uid();
  revision.revises = original.id;
  revision.createdAt = new Date().toISOString();
  invalidateForm(revision);
  s.forms.push(revision);
  audit(s, "Create driving form revision", revision.id, undefined, { revises: id });
  return revision.id;
}
export function deleteForm(s: Workspace, id: string) {
  const record = s.forms.find(f => f.id === id);
  if (!record) throw Error("Form not found.");
  audit(s, "Delete driving form", id, record);
  s.forms = s.forms.filter(f => f.id !== id);
}
export function newForm(s: Workspace, previous?: FormRecord): FormRecord {
  const p = s.profile, defaults = getFormDefaults(s);
  return {
    id: uid(),
    driverId: p.id,
    values: {
      ...previous?.values,
      driver: defaults.driver,
      contact: defaults.contact,
      licence: defaults.licence,
      expiry: defaults.expiry,
      scheme: p.scheme,
      accreditation: p.certificate,
      date: today(p.zone),
      base: p.base,
      zone: p.zone,
      depart: "",
      arrive: "",
      hours: "",
      manifest: "",
      odo: "",
      comments: "",
    },
    checks: { pm: {}, t1: {}, t2: {}, t3: {} },
    declarations: {},
    company: defaults.company,
    logo: defaults.logo,
    showCompany: defaults.showCompany,
    showLogo: defaults.showLogo,
    signature: "",
    signedName: "",
    reviewed: false,
    status: "Draft",
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
export function invalidateForm(f: FormRecord) {
  f.signature = "";
  f.signedName = "";
  f.reviewed = false;
  f.status = "Draft";
  f.revision++;
  f.updatedAt = new Date().toISOString();
}
export function allClear(f: FormRecord, part: "checks" | "declarations") {
  invalidateForm(f);
  if (part === "checks") {
    const keys = vehiclesInForm(f);
    if (!keys.length) throw Error("Enter the truck registration first.");
    for (const k of keys) {
      f.checks[k] ||= {};
      inspection.forEach((_, i) => {
        if (!f.checks[k][i]) f.checks[k][i] = "ok";
      });
    }
  } else {
    if (
      vehiclesInForm(f).some((k) =>
        Object.values(f.checks[k] || {}).includes("issue"),
      )
    )
      throw Error("A vehicle fault is recorded. Review each declaration.");
    declarations.forEach(([, v], i) => {
      if (!f.declarations[i]) f.declarations[i] = v;
    });
  }
}
export function validateForm(f: FormRecord) {
  if (
    !f.values.driver?.trim() ||
    !f.values.licence?.trim() ||
    !f.values.pm?.trim()
  )
    throw Error("Enter the driver, licence and truck registration.");
  const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || "");
  if (!validDate(f.values.date) || !validTime(f.values.depart))
    throw Error("Enter the departure date and time.");
  if (!f.values.from?.trim() || !f.values.to?.trim() || !f.values.arrive)
    throw Error("Enter the route and estimated arrival.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.values.arrive) ||
      !validDate(f.values.arrive.slice(0,10)) || !validTime(f.values.arrive.slice(11)))
    throw Error("Enter a valid estimated arrival date and time.");
  if (f.values.arrive < f.values.date + "T" + f.values.depart)
    throw Error("Arrival is before departure.");
  if (
    vehiclesInForm(f).some((k) =>
      inspection.some(
        (_, i) => !["ok", "issue", "na"].includes(f.checks[k]?.[i]),
      ),
    )
  )
    throw Error("Complete the inspection for each listed vehicle.");
  if (declarations.some((_, i) => !["Yes", "No"].includes(f.declarations[i])))
    throw Error("Complete all driver declarations.");
  const faults = vehiclesInForm(f).some((k) =>
    Object.values(f.checks[k] || {}).includes("issue"),
  );
  if (faults && !f.values.comments?.trim())
    throw Error("Describe the vehicle fault and action taken in Comments.");
  if (faults && (f.declarations[6] === "No" || f.declarations[10] === "Yes"))
    throw Error(
      "The recorded faults conflict with declarations 7 or 11. Review them.",
    );
}
export function signForm(
  f: FormRecord,
  s: Workspace,
  signature = getFormDefaults(s).signature,
) {
  if (f.status === "Signed") throw Error("This form is already signed.");
  validateForm(f);
  if (
    f.driverId !== s.profile.id ||
    f.values.driver !== getFormDefaults(s).driver ||
    f.values.licence !== getFormDefaults(s).licence
  )
    throw Error("Save this driver in Form defaults before signing.");
  if (!signature || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature))
    throw Error("Draw a signature or save one in Settings first.");
  f.signature = signature;
  f.signedName = f.values.driver;
  f.reviewed = true;
  f.status = "Signed";
  f.updatedAt = new Date().toISOString();
}
export function editForm(
  s: Workspace,
  id: string,
  fn: (f: FormRecord) => void,
) {
  const i = s.forms.findIndex((f) => f.id === id);
  if (i < 0) throw Error("Form not found.");
  if (s.forms[i].status === "Signed")
    throw Error("Duplicate the signed form to make changes.");
  const f = clone(s.forms[i]);
  invalidateForm(f);
  fn(f);
  s.forms[i] = f;
}

