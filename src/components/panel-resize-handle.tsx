"use client";

// Drag handle on the left edge of a right-anchored panel. Reports the pointer's
// clientX during drag; the parent turns it into a width (window.innerWidth - x).
export function PanelResizeHandle({ onResize }: { onResize: (clientX: number) => void }) {
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) => onResize(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.userSelect = "none";
  }

  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar painel"
      className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-ew-resize bg-transparent transition-colors hover:bg-primary/30"
    />
  );
}
