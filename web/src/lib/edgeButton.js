// How far either side of a connector its hover target reaches: half the stroke
// width of .tree-edge-hit. Two lines this close fight over the same pointer.
const HIT_REACH = 6;

// The straight runs of a connector built from M, V and H commands.
function segmentsOf(d) {
  const segments = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MVH])([^MVH]*)/g)) {
    const values = args.trim().split(/\s+/).map(Number);
    if (cmd === 'M') {
      [x, y] = values;
    } else if (cmd === 'V') {
      segments.push({ vertical: true, at: x, from: Math.min(y, values[0]), to: Math.max(y, values[0]) });
      y = values[0];
    } else {
      segments.push({ vertical: false, at: y, from: Math.min(x, values[0]), to: Math.max(x, values[0]) });
      x = values[0];
    }
  }
  return segments.filter((segment) => segment.to > segment.from);
}

const pointOn = (segment, along) =>
  segment.vertical ? { x: segment.at, y: along } : { x: along, y: segment.at };

// Where a connector's remove button sits: the middle of its longest stretch
// that no other hoverable line runs along. Siblings share a bar, so moving the
// pointer along a shared stretch hands the hover to a sibling and the button
// jumps away before it can be reached. On a stretch of its own, it stays put.
// If every stretch is shared, it falls back to the run into the child.
export function unlinkButtonPoint(d, otherPaths = []) {
  const segments = segmentsOf(d);
  const others = otherPaths.flatMap(segmentsOf);
  let best = null;
  for (const segment of segments) {
    const covering = others
      .filter(
        (other) =>
          other.vertical === segment.vertical &&
          Math.abs(other.at - segment.at) <= HIT_REACH &&
          other.from < segment.to &&
          segment.from < other.to
      )
      .sort((a, b) => a.from - b.from);
    let start = segment.from;
    const consider = (end) => {
      // At equal length the later stretch wins: it is nearer the child.
      if (end > start && (!best || end - start >= best.length)) {
        best = { segment, length: end - start, along: (start + end) / 2 };
      }
    };
    for (const other of covering) {
      consider(Math.min(other.from, segment.to));
      start = Math.max(start, other.to);
    }
    consider(segment.to);
  }
  if (best) return pointOn(best.segment, best.along);
  const last = segments[segments.length - 1];
  return last ? pointOn(last, (last.from + last.to) / 2) : { x: 0, y: 0 };
}
