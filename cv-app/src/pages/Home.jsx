import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Design-space: your art is composed for 1920x1080.
 * We scale the whole layer to fit the viewport and center it (letterboxed if needed).
 */
const DESIGN = { W: 1920, H: 1080 };

/** Menu layout (coords are in design pixels). Tweak these to line up with your art. */
const MENU_ITEMS = [
  {
    label: "Play",
    path: "/play",
    img: "/menu/btn_play.png",
    imgSel: "/menu/btn_play_sel.png", // optional
    x: 900,           // top-left X of the Play button image in your design
    y: 520,           // top-left Y
    w: 420,           // width  of button image (set roughly; fine-tune after you add art)
    h: 96,            // height of button image
  },
  {
    label: "Credits",
    path: "/credits",
    img: "/menu/btn_credits.png",
    imgSel: "/menu/btn_credits_sel.png",
    x: 900,
    y: 650,
    w: 420,
    h: 96,
  },
  {
    label: "Exit",
    path: "/exit",
    img: "/menu/btn_exit.png",
    imgSel: "/menu/btn_exit_sel.png",
    x: 900,
    y: 780,
    w: 420,
    h: 96,
  },
];

/** Arrow placement (relative to menu item). */
const ARROW = {
  src: "/menu/arrow.png",
  // place arrow to the left of each button; we’ll vertically center on the button
  offsetX: -120,     // arrow’s left edge = item.x + offsetX
  offsetY: 0,        // tweak if your arrow isn’t perfectly centered
  w: 64,             // arrow image display size (can be natural size)
  h: 64,
};

export default function Home() {
  const nav = useNavigate();
  const [index, setIndex] = useState(0);
  const wrapRef = useRef(null);

  // focus so key events work
  useEffect(() => { wrapRef.current?.focus(); }, []);

  // viewport scaling math (maintain aspect; center)
  const { scale, offsetX, offsetY } = useViewportScale();

  const onKeyDown = (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowdown" || k === "arrowup") e.preventDefault();
    if (k === "arrowdown" || k === "s") setIndex((i) => (i + 1) % MENU_ITEMS.length);
    else if (k === "arrowup" || k === "w") setIndex((i) => (i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
    else if (k === "enter") nav(MENU_ITEMS[index].path);
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{
        minHeight: "100vh",
        margin: 0,
        background: "#000",
        display: "grid",
        placeItems: "center",
        outline: "none",
        userSelect: "none",
      }}
      aria-label="Main menu"
      role="menu"
    >
      {/* Design layer (1920x1080) scaled to fit */}
      <div
        style={{
          position: "relative",
          width: DESIGN.W,
          height: DESIGN.H,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          transformOrigin: "top left",
          imageRendering: "auto",
        }}
      >
        {/* Background art */}
        <img
          src="/menu/bg.png"
          alt=""
          draggable="false"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
        />

        {/* Arrow (moves with current selection) */}
        {(() => {
          const it = MENU_ITEMS[index];
          const ax = it.x + ARROW.offsetX;
          const ay = it.y + (it.h - ARROW.h) / 2 + ARROW.offsetY;
          return (
            <img
              src={ARROW.src}
              alt=""
              draggable="false"
              style={{
                position: "absolute",
                left: ax,
                top: ay,
                width: ARROW.w,
                height: ARROW.h,
                pointerEvents: "none",
              }}
            />
          );
        })()}

        {/* Buttons as images (clickable) */}
        {MENU_ITEMS.map((it, i) => {
          const selected = i === index;
          const src = selected && it.imgSel ? it.imgSel : it.img;
          return (
            <img
              key={it.label}
              src={src}
              alt={it.label}
              draggable="false"
              onMouseEnter={() => setIndex(i)}
              onClick={() => nav(it.path)}
              role="menuitem"
              aria-selected={selected}
              style={{
                position: "absolute",
                left: it.x,
                top: it.y,
                width: it.w,
                height: it.h,
                cursor: "pointer",
                // If you don't have *_sel.png yet, add a subtle glow for the selected item:
                filter: !it.imgSel && selected ? "drop-shadow(0 0 12px rgba(255,255,255,.45))" : "none",
                transition: "filter .15s ease",
              }}
            />
          );
        })}
      </div>

      <p style={{ position: "fixed", bottom: 12, opacity: 0.7, fontSize: 12 }}>
        ↑/↓ (or W/S) to select • Enter to confirm
      </p>
    </div>
  );
}

/* ---------- scaling hook ---------- */
function useViewportScale() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // letterbox fit
  const scale = useMemo(() => {
    const sx = vp.w / DESIGN.W;
    const sy = vp.h / DESIGN.H;
    return Math.min(sx, sy);
  }, [vp]);

  const offsetX = Math.max(0, (vp.w - DESIGN.W * scale) / 2);
  const offsetY = Math.max(0, (vp.h - DESIGN.H * scale) / 2);
  return { scale, offsetX, offsetY };
}
