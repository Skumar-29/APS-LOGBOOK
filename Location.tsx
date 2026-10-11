import { useState } from "react";
import { useStore } from "../context";
import { Action, Field, Modal } from "./UI";
let lastRequest = 0;
export function Location({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  const { s, mutate } = useStore(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [position, setPosition] = useState(""),
    [busy, setBusy] = useState(false);
  const places = s.places.filter((p) =>
    p.toLowerCase().includes(query.toLowerCase()),
  );
  async function choose(p: string) {
    onChange(p);
    await mutate((w) => {
      w.places = [p, ...w.places.filter((x) => x !== p)].slice(0, 200);
    });
    setOpen(false);
  }
  async function gps() {
    if (!navigator.geolocation)
      throw Error(
        "Location is unavailable on this device. Enter a place manually.",
      );
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        }),
      );
      const { latitude, longitude, accuracy } = pos.coords;
      setPosition(
        `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)} m)`,
      );
      if (!navigator.onLine)
        throw Error("You are offline. Enter the town or select a saved place.");
      if (Date.now() - lastRequest < 1200)
        throw Error("Please wait a moment before locating again.");
      lastRequest = Date.now();
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!response.ok)
        throw Error("Place lookup is unavailable. Enter a place manually.");
      const data = await response.json(),
        name = data.locality || data.city || "";
      if (!name)
        throw Error("No town found here. Enter the location manually.");
      setQuery(name);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e)
        throw Error(
          e.code === 1
            ? "Location permission was declined. Enter a place manually."
            : "Could not determine your location. Try again or enter it manually.",
        );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="location-field">
      <Field
        label="Location"
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {s.settings.locationPicker && !disabled && (
        <button
          className="location-button"
          aria-label="Choose location"
          onClick={() => {
            setQuery(value);
            setOpen(true);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2" />
            <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
          </svg>
        </button>
      )}
      {open && (
        <Modal title="Choose location" onClose={() => setOpen(false)}>
          <Field
            label="Suburb, town or rest stop"
            value={query}
            onChange={setQuery}
          />
          <div className="row">
            <Action onClick={gps} disabled={busy}>
              {busy ? "Locating…" : "Use current location"}
            </Action>
            <Action
              onClick={() => choose(query.trim())}
              disabled={!query.trim()}
              primary
            >
              Use this place
            </Action>
          </div>
          {position && <p className="small">{position}</p>}
          <div className="place-list">
            {places.slice(0, 20).map((p) => (
              <Action key={p} onClick={() => choose(p)}>
                {p}
              </Action>
            ))}
          </div>
          <p className="small">
            Use current location sends your coordinates to BigDataCloud for a
            town lookup. Confirm the result before saving.
          </p>
        </Modal>
      )}
    </div>
  );
}
