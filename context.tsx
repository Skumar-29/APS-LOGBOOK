import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clone, type Workspace } from "./domain/model";
import { loadWorkspace, saveWorkspace } from "./storage";
type Mutation = (s: Workspace) => void | Workspace;
interface Store {
  s: Workspace;
  mutate: (fn: Mutation, checkpoint?: boolean) => Promise<Workspace>;
  run: (fn: () => unknown | Promise<unknown>) => void;
  busy: boolean;
  notice: string;
  error: string;
  clear: () => void;
  latest: () => Promise<Workspace>;
  refresh: () => Promise<Workspace>;
}
const Context = createContext<Store | null>(null);
export const useStore = () => {
  const v = useContext(Context);
  if (!v) throw Error("Store unavailable");
  return v;
};
export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Workspace | null>(null),
    ref = useRef<Workspace | null>(null),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    pending = useRef(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    loadWorkspace()
      .then((v) => {
        ref.current = v;
        setS(v);
      })
      .catch((e) => setError(String(e.message || e)));
    const c = new BroadcastChannel("truck-workspace");
    c.onmessage = async () => {
      if (pending.current) return;
      const v = await loadWorkspace();
      if (v.revision !== (ref.current?.revision || 0)) {
        ref.current = v;
        setS(v);
        setNotice("Records refreshed from another tab.");
      }
    };
    const guard = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      c.close();
      window.removeEventListener("beforeunload", guard);
    };
  }, []);
  function mutate(fn: Mutation, checkpoint = false) {
    pending.current++;
    setBusy(true);
    const next = queue.current
      .catch(() => {})
      .then(async () => {
        if (!ref.current) throw Error("Records are not loaded.");
        const working = clone(ref.current),
          result = fn(working) || working;
        const saved = await saveWorkspace(
          result,
          ref.current.revision,
          checkpoint,
        );
        ref.current = saved;
        setS(saved);
        setNotice("Saved on this device");
        return saved;
      });
    queue.current = next;
    next
      .catch((e) => setError(String(e.message || e)))
      .finally(() => {
        pending.current--;
        setBusy(pending.current > 0);
      });
    return next;
  }
  const run = (fn: () => unknown | Promise<unknown>) => {
    setError("");
    Promise.resolve()
      .then(fn)
      .catch((e) => setError(String(e.message || e)));
  };
  if (!s)
    return (
      <main className="loading">
        <h1>Truck Workspace</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Opening your records…"}
        </p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </main>
    );
  return (
    <Context.Provider
      value={{
        s,
        mutate,
        run,
        busy,
        notice,
        error,
        clear: () => {
          setError("");
          setNotice("");
        },
        refresh: () => {
          const next = queue.current.catch(() => {}).then(async () => {
            const value = await loadWorkspace();
            if (value.revision >= (ref.current?.revision || 0)) {
              ref.current = value; setS(value); setNotice("Records refreshed");
            }
            return ref.current!;
          });
          queue.current = next;
          return next;
        },
        latest: async () => {
          await queue.current;
          return ref.current!;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
