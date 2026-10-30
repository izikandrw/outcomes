import { useEffect, useState } from 'react';

// Whether a sticky toolbar has scrolled up to where it sticks, under the pinned
// nav. Stuck, it grows a band up to the top of the window, so the nav and
// the toolbar read as one panel rather than two things floating apart.
export default function useStuck(ref) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    function check() {
      const toolbar = ref.current;
      if (toolbar) setStuck(toolbar.getBoundingClientRect().top <= parseFloat(getComputedStyle(toolbar).top) + 0.5);
    }
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [ref]);

  return stuck;
}
