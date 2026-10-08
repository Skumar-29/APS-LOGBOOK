import { useEffect, useState } from "react";
import { useStore } from "../context";
import { audit, clone, uid, type Note } from "../domain/model";
import { decryptBackup, encryptBackup } from "../domain/encryption";
import { Action, Check, Empty, Field, Modal } from "../components/UI";
export function Notes() {
  const { s, mutate } = useStore(),
    [query, setQuery] = useState(""),
    [draft, setDraft] = useState<Note | null>(null),
    [shown, setShown] = useState<string[]>([]),
    [remove, setRemove] = useState(""),
    [unlock, setUnlock] = useState<Note | null>(null),
    [password, setPassword] = useState(""),
    [encrypted, setEncrypted] = useState(false);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setShown([]);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  function open(n: Note) {
    setPassword("");
    setEncrypted(!!n.sealed);
    if (n.sealed) setUnlock(n);
    else setDraft(clone(n));
  }
  function update(fn: (n: Note) => void) {
    setDraft((n) => {
      const next = clone(n!);
      fn(next);
      return next;
    });
  }
  function close() {
    setDraft(null);
    setUnlock(null);
    setPassword("");
  }
  async function save() {
    if (!draft?.title.trim()) throw Error("Enter a note title.");
    const next = clone(draft);
    if (encrypted) {
      next.sealed = await encryptBackup(
        JSON.stringify({ body: next.body, rows: next.rows }),
        password,
      );
      next.body = "";
      next.rows = [];
    } else delete next.sealed;
    next.updatedAt = new Date().toISOString();
    await mutate((w) => {
      const index = w.notes.findIndex((n) => n.id === next.id);
      if (index >= 0) w.notes[index] = next;
      else w.notes.push(next);
    });
    close();
  }
  return (
    <>
      <div className="row">
        <h1>Notes</h1>
        <Action
          primary
          onClick={() => {
            setEncrypted(false);
            setPassword("");
            setDraft({
              id: uid(),
              title: "",
              body: "",
              rows: [],
              tags: "",
              favourite: false,
              private: true,
              updatedAt: new Date().toISOString(),
            });
          }}
        >
          + New note
        </Action>
      </div>
      <Field label="Search notes" value={query} onChange={setQuery} />
      {s.notes
        .filter((n) =>
          (
            n.title +
            " " +
            n.tags +
            " " +
            n.body +
            " " +
            n.rows.map((r) => r[0]).join(" ")
          )
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.favourite) - Number(a.favourite) ||
            b.updatedAt.localeCompare(a.updatedAt),
        )
        .map((n) => (
          <article className="card" key={n.id}>
            <div className="row">
              <h2>
                {n.favourite ? "★ " : ""}
                {n.title}
              </h2>
              <div className="row">
                <Action
                  onClick={() =>
                    mutate((w) => {
                      const x = w.notes.find((x) => x.id === n.id)!;
                      x.favourite = !x.favourite;
                    })
                  }
                >
                  {n.favourite ? "Unpin" : "Pin"}
                </Action>
                <Action onClick={() => open(n)}>
                  {n.sealed ? "Unlock" : "Edit"}
                </Action>
              </div>
            </div>
            {n.sealed ? (
              <p className="small">Encrypted contents</p>
            ) : n.private && !shown.includes(n.id) ? (
              <div className="row">
                <span className="masked">••••••••</span>
                <Action onClick={() => setShown((a) => [...a, n.id])}>
                  Reveal
                </Action>
              </div>
            ) : (
              <>
                <p className="note-body">{n.body}</p>
                {n.rows.length > 0 && (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {Array.from(
                            {
                              length: Math.max(...n.rows.map((r) => r.length)),
                            },
                            (_, i) => (
                              <th key={i}>
                                {i === 0
                                  ? "Item"
                                  : i === 1
                                    ? "Detail"
                                    : "Column " + (i + 1)}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {n.rows.map((r, i) => (
                          <tr key={i}>
                            {r.map((c, j) => (
                              <td key={j}>{c}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {n.private && (
                  <Action
                    onClick={() => setShown((a) => a.filter((x) => x !== n.id))}
                  >
                    Hide
                  </Action>
                )}
              </>
            )}
            <small>{n.tags}</small>
          </article>
        ))}
      {!s.notes.length && (
        <Empty>
          Save depot access details, fuel codes and trip notes here.
        </Empty>
      )}
      {draft && (
        <Modal title="Edit note" onClose={close}>
          <Field
            label="Title"
            value={draft.title}
            onChange={(v) =>
              update((n) => {
                n.title = v;
              })
            }
          />
          <Field
            label="Note"
            type="textarea"
            value={draft.body}
            onChange={(v) =>
              update((n) => {
                n.body = v;
              })
            }
          />
          <Field
            label="Tags"
            value={draft.tags}
            onChange={(v) =>
              update((n) => {
                n.tags = v;
              })
            }
          />
          <Check
            label="Hide contents until revealed"
            value={draft.private}
            onChange={(v) =>
              update((n) => {
                n.private = v;
              })
            }
          />
          <div className="table-scroll">
            <table>
              <tbody>
                {draft.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>
                        <Field
                          label={`Row ${i + 1}, ${j === 0 ? "item" : "detail " + j}`}
                          value={c}
                          onChange={(v) =>
                            update((n) => {
                              n.rows[i][j] = v;
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <Action
                        onClick={() =>
                          update((n) => {
                            n.rows.splice(i, 1);
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
          <div className="row wrap">
            <Action
              onClick={() =>
                update((n) => {
                  n.rows.push(Array(n.rows[0]?.length || 2).fill(""));
                })
              }
            >
              + Row
            </Action>
            <Action
              disabled={!draft.rows.length}
              onClick={() =>
                update((n) => {
                  n.rows.forEach((r) => r.push(""));
                })
              }
            >
              + Column
            </Action>
          </div>
          <Check
            label="Encrypt note contents with a passphrase"
            value={encrypted}
            onChange={setEncrypted}
          />
          {encrypted && !draft.sealed && (
            <Field
              label="Note passphrase (at least 12 characters)"
              type="password"
              value={password}
              onChange={setPassword}
            />
          )}
          <p className="small">
            {encrypted
              ? "Title and tags remain visible. Keep your passphrase; it cannot be recovered."
              : "Hiding protects the screen view. The saved contents and backups remain readable."}
          </p>
          <div className="row wrap">
            <Action primary onClick={save}>
              {encrypted ? "Save & lock" : "Save note"}
            </Action>
            <Action onClick={close}>Cancel</Action>
            {s.notes.some((n) => n.id === draft.id) && (
              <Action danger onClick={() => setRemove(draft.id)}>
                Delete
              </Action>
            )}
          </div>
        </Modal>
      )}
      {unlock && (
        <Modal title={"Unlock " + unlock.title} onClose={close}>
          <Field
            label="Note passphrase"
            type="password"
            value={password}
            onChange={setPassword}
          />
          <Action
            primary
            onClick={async () => {
              const data = JSON.parse(
                await decryptBackup(unlock.sealed!, password),
              );
              if (
                typeof data.body !== "string" ||
                !Array.isArray(data.rows) ||
                data.rows.some(
                  (r: unknown) =>
                    !Array.isArray(r) || r.some((c) => typeof c !== "string"),
                )
              )
                throw Error("Invalid note contents.");
              setDraft({ ...clone(unlock), body: data.body, rows: data.rows });
              setUnlock(null);
            }}
          >
            Unlock note
          </Action>
        </Modal>
      )}
      {remove && (
        <Modal title="Delete note?" onClose={() => setRemove("")}>
          <Action
            danger
            onClick={async () => {
              await mutate((w) => {
                audit(w, "Delete note", remove, undefined, {
                  title: w.notes.find((n) => n.id === remove)?.title,
                });
                w.notes = w.notes.filter((n) => n.id !== remove);
              });
              setRemove("");
              close();
            }}
          >
            Delete note
          </Action>
        </Modal>
      )}
    </>
  );
}
