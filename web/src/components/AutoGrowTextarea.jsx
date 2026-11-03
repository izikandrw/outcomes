import { useEffect, useLayoutEffect, useRef } from 'react';
import { fitHeight } from './InlineFields.jsx';

// A textarea as tall as its text, so a long description reads in full without a
// scrollbar of its own. `rows` is the height it never shrinks below.
export default function AutoGrowTextarea({ rows = 8, className = '', ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => fit(ref.current), [props.value]);

  // Text rewraps when the width changes. This also catches the first layout in
  // a modal, whose <dialog> is still closed, so unmeasurable, when this mounts.
  useEffect(() => {
    const textarea = ref.current;
    let width = 0;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      fit(textarea);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  return <textarea ref={ref} rows={rows} className={`auto-grow ${className}`.trim()} {...props} />;
}

// fitHeight collapses the box to measure it. That briefly shortens the form, and
// the browser would pull a form scrolled to its end back up on every keystroke.
function fit(textarea) {
  const scroller = textarea.closest('.side-panel, .modal');
  const top = scroller?.scrollTop;
  fitHeight(textarea);
  if (scroller) scroller.scrollTop = top;
}
