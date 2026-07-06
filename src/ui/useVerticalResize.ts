import { useState } from "react";

/**
 * Drag-to-resize state for a vertically sized section: returns the current
 * height, a mousedown handler for the drag bar, and persistence.
 */
export function useVerticalResize(
  storageKey: string,
  defaultHeight: number,
  min = 80,
): { height: number; startResize: (e: React.MouseEvent) => void } {
  const [height, setHeight] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved >= min ? saved : defaultHeight;
  });

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    const clamp = (h: number) =>
      Math.min(Math.round(window.innerHeight * 0.7), Math.max(min, h));
    document.body.classList.add("resizing-v");
    const onMove = (move: MouseEvent) => {
      setHeight(clamp(startHeight - (move.clientY - startY)));
    };
    const onUp = (up: MouseEvent) => {
      localStorage.setItem(
        storageKey,
        String(clamp(startHeight - (up.clientY - startY))),
      );
      document.body.classList.remove("resizing-v");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return { height, startResize };
}
