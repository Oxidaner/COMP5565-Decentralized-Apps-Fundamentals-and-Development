import { useEffect } from "react";

// One delegated listener drives every [data-tilt] element. It only writes CSS
// variables (--rx, --ry, --mx, --my); the stylesheet decides what moves.
export function useTilt() {
  useEffect(() => {
    const media = window.matchMedia;
    if (!media || media("(prefers-reduced-motion: reduce)").matches || !media("(hover: hover) and (pointer: fine)").matches) return;

    let active: HTMLElement | null = null;
    let last: PointerEvent | null = null;
    let frame = 0;

    const reset = (element: HTMLElement) => {
      element.classList.remove("is-tilting");
      for (const name of ["--rx", "--ry", "--mx", "--my"]) element.style.removeProperty(name);
    };

    const apply = () => {
      frame = 0;
      if (!active || !last) return;
      const box = active.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (last.clientX - box.left) / box.width));
      const y = Math.min(1, Math.max(0, (last.clientY - box.top) / box.height));
      const max = Number(active.dataset.tilt) || 6;
      active.style.setProperty("--rx", `${((0.5 - y) * max).toFixed(2)}deg`);
      active.style.setProperty("--ry", `${((x - 0.5) * max).toFixed(2)}deg`);
      active.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      active.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    };

    const move = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tilt]") : null;
      if (target !== active) {
        if (active) reset(active);
        active = target;
        active?.classList.add("is-tilting");
      }
      last = event;
      if (active && !frame) frame = window.requestAnimationFrame(apply);
    };

    const leave = () => {
      if (active) reset(active);
      active = null;
    };

    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.cancelAnimationFrame(frame);
      if (active) reset(active);
    };
  }, []);
}
