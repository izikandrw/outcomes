import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MinusIcon, PlusIcon } from './icons.jsx';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
// The levels the +/- buttons and keyboard shortcuts step through.
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2];

const clamp = (zoom) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

function readStored(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return value > 0 ? clamp(value) : 1;
  } catch {
    return 1;
  }
}

// The nearest ancestor that scrolls vertically; the page itself if none does.
function scrollParent(element) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return document.scrollingElement;
}

function isEditable(target) {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');
}

// Zoom for a diagram drawn in an <svg> inside a horizontally scrolling box.
// Render the svg at `width * zoom` x `height * zoom` with a viewBox of the
// natural size, so the box's scrollbars keep working at every level.
//
// Zooms with the returned controls, Ctrl/Cmd + plus, minus and 0 (or bare
// +, - and 0 while focus is on the diagram), and Ctrl/Cmd + wheel or a
// trackpad pinch. Each change keeps the point under the pointer (or the
// middle of the visible area) where it was.
export function useZoom({ storageKey, width }) {
  const [zoom, setZoomState] = useState(() => readStored(storageKey));
  const scrollRef = useRef(null);
  const svgRef = useRef(null);
  // The zoom the svg was last drawn at, and the latest one asked for, which
  // can run ahead of it while several wheel events land before a render.
  const drawn = useRef(zoom);
  const wanted = useRef(zoom);
  // { x, y } in diagram units, and the client point it should end up under.
  const anchor = useRef(null);

  const zoomTo = useCallback((next, point) => {
    const scroller = scrollRef.current;
    const svg = svgRef.current;
    const level = clamp(next);
    if (!scroller || !svg || level === wanted.current) return;

    if (!point) {
      // The middle of the part of the diagram that's on screen.
      const box = scroller.getBoundingClientRect();
      const top = Math.max(box.top, 0);
      const bottom = Math.min(box.bottom, window.innerHeight);
      point = { clientX: box.left + box.width / 2, clientY: (top + bottom) / 2 };
    }
    if (anchor.current) {
      anchor.current = { ...anchor.current, clientX: point.clientX, clientY: point.clientY };
    } else {
      const rect = svg.getBoundingClientRect();
      anchor.current = {
        x: (point.clientX - rect.left) / drawn.current,
        y: (point.clientY - rect.top) / drawn.current,
        clientX: point.clientX,
        clientY: point.clientY,
      };
    }
    wanted.current = level;
    setZoomState(level);
  }, []);

  // Scroll so the anchored point is back under the pointer.
  useLayoutEffect(() => {
    drawn.current = zoom;
    const point = anchor.current;
    anchor.current = null;
    try {
      localStorage.setItem(storageKey, String(zoom));
    } catch {
      // Storage can be unavailable (private windows); zoom just won't persist.
    }
    if (!point || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    scrollRef.current.scrollLeft += rect.left + point.x * zoom - point.clientX;
    scrollParent(scrollRef.current).scrollTop += rect.top + point.y * zoom - point.clientY;
  }, [zoom, storageKey]);

  const zoomIn = useCallback(
    (point) => zoomTo(STEPS.find((step) => step > wanted.current + 0.001) ?? ZOOM_MAX, point),
    [zoomTo],
  );
  const zoomOut = useCallback(
    (point) => zoomTo([...STEPS].reverse().find((step) => step < wanted.current - 0.001) ?? ZOOM_MIN, point),
    [zoomTo],
  );
  const reset = useCallback(() => zoomTo(1), [zoomTo]);
  // Shrink a wide diagram to the width of its box; never enlarge past 100%.
  const fit = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || !width) return;
    const style = getComputedStyle(scroller);
    const inner = scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    zoomTo(Math.min(1, inner / width));
  }, [width, zoomTo]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.altKey || isEditable(event.target)) return;
      const modified = event.ctrlKey || event.metaKey;
      // Without a modifier, only while focus is somewhere in the diagram.
      if (!modified && !scrollRef.current?.contains(event.target)) return;
      if (event.key === '=' || event.key === '+') zoomIn();
      else if (event.key === '-' || event.key === '_') zoomOut();
      else if (event.key === '0') reset();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut, reset]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    // Ctrl/Cmd + wheel, which is also what a trackpad pinch sends in Chrome
    // and Firefox. Plain wheel still scrolls.
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      // Lines to pixels, then capped so one mouse-wheel notch is ~25% while
      // a pinch's many small deltas zoom smoothly.
      const delta = Math.max(-25, Math.min(25, event.deltaY * (event.deltaMode === 1 ? 20 : 1)));
      zoomTo(wanted.current * Math.exp(-delta * 0.01), event);
    };
    // Safari reports a trackpad pinch as gesture events instead.
    let gestureStart = 1;
    const onGestureStart = (event) => {
      event.preventDefault();
      gestureStart = wanted.current;
    };
    const onGestureChange = (event) => {
      event.preventDefault();
      zoomTo(gestureStart * event.scale, event);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('gesturestart', onGestureStart);
    scroller.addEventListener('gesturechange', onGestureChange);
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('gesturestart', onGestureStart);
      scroller.removeEventListener('gesturechange', onGestureChange);
    };
  }, [zoomTo]);

  return { zoom, scrollRef, svgRef, zoomIn, zoomOut, reset, fit };
}

const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function ZoomControls({ zoom, zoomIn, zoomOut, reset, fit }) {
  return (
    <div className="view-toggle zoom-controls" role="group" aria-label="Zoom">
      <button
        type="button"
        onClick={() => zoomOut()}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Zoom out"
        title={`Zoom out (${shortcut}−)`}
      >
        <MinusIcon />
      </button>
      <button
        type="button"
        className="zoom-level"
        onClick={reset}
        aria-label={`Zoom ${Math.round(zoom * 100)}%, reset to 100%`}
        title={`Reset to 100% (${shortcut}0)`}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => zoomIn()}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Zoom in"
        title={`Zoom in (${shortcut}+)`}
      >
        <PlusIcon />
      </button>
      <button type="button" onClick={fit} title="Fit the map to the width of the page">
        Fit
      </button>
    </div>
  );
}
