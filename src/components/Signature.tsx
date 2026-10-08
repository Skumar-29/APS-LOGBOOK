import { useEffect, useRef, useState } from "react";
import { Action } from "./UI";
export function Signature({
  value,
  onSave,
  drawLabel = "Draw my signature",
  saveLabel = "Save signature",
}: {
  drawLabel?: string;
  saveLabel?: string;
  value: string;
  onSave: (data: string) => Promise<unknown>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    hasInk = useRef(false),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) return;
    const c = canvas.current!,
      ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#17263c";
  }, [editing]);
  function point(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * 600) / r.width,
      ((e.clientY - r.top) * 180) / r.height,
    ];
  }
  return (
    <div className="signature">
      {value && !editing && <img src={value} alt="Saved driver signature" />}
      {editing ? (
        <>
          <canvas
            ref={canvas}
            width="600"
            height="180"
            aria-label="Draw signature"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              const [x, y] = point(e),
                ctx = e.currentTarget.getContext("2d")!;
              ctx.beginPath();
              ctx.moveTo(x, y);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const [x, y] = point(e),
                ctx = e.currentTarget.getContext("2d")!;
              ctx.lineTo(x, y);
              ctx.stroke();
              hasInk.current = true;
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
            onPointerCancel={() => {
              drawing.current = false;
            }}
          />
          <div className="row">
            <Action
              onClick={() => {
                canvas.current!.getContext("2d")!.clearRect(0, 0, 600, 180);
                hasInk.current = false;
              }}
            >
              Clear
            </Action>
            <Action
              primary
              onClick={async () => {
                if (!hasInk.current) throw Error("Draw your signature first.");
                await onSave(canvas.current!.toDataURL("image/png"));
                setEditing(false);
              }}
            >
              {saveLabel}
            </Action>
            <Action onClick={() => setEditing(false)}>Cancel</Action>
          </div>
        </>
      ) : (
        <Action
          onClick={() => {
            hasInk.current = false;
            setEditing(true);
          }}
        >
          {value ? "Replace signature" : drawLabel}
        </Action>
      )}
    </div>
  );
}
