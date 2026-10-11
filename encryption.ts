const enc = new TextEncoder(),
  dec = new TextDecoder();
function encode(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(s);
}
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(pass: string, salt: Uint8Array) {
  const seed = await crypto.subtle.importKey(
    "raw",
    enc.encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: 310000,
      hash: "SHA-256",
    },
    seed,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptBackup(text: string, pass: string) {
  if (pass.length < 12)
    throw Error("Use a passphrase of at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    k = await key(pass, salt),
    data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      k,
      enc.encode(text),
    );
  return JSON.stringify({
    format: "truck-workspace-encrypted",
    version: 1,
    salt: encode(salt),
    iv: encode(iv),
    data: encode(new Uint8Array(data)),
  });
}
export async function decryptBackup(text: string, pass: string) {
  const j = JSON.parse(text);
  if (j.format !== "truck-workspace-encrypted" || j.version !== 1)
    throw Error("Unsupported encrypted backup.");
  try {
    const salt = decode(j.salt),
      iv = decode(j.iv);
    if (salt.length !== 16 || iv.length !== 12) throw Error();
    const data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await key(pass, salt),
      decode(j.data),
    );
    return dec.decode(data);
  } catch {
    throw Error(
      "Incorrect passphrase or damaged encrypted backup. No records changed.",
    );
  }
}
