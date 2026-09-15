import { useEffect, useState } from 'react';
import { measurementsForOutcome, projectsForOutcome, targetsForOutcome } from '../lib/links.js';

const NODE_W = 160;
const NODE_H = 56;
const H_GAP = 24; // between sibling subtrees
const V_GAP = 54; // between a node's bottom edge and its children's top edge
const LEVEL_H = NODE_H + V_GAP;
const PAD = 20;
const LINE_H = 15;
const MAX_CHARS = 21;
const MAX_LINES = 3;

// Top-down node-link diagram: each node is centred over the block its children
// occupy, so sibling subtrees never overlap however wide they fan out.
export default function OutcomeTree({
  outcomes,
  teams,
  projects,
  targets,
  measurements,
  onEdit,
  onAdd,
}) {
  const { nodes, edges, width, height } = layout(outcomes);
  const nameOf = (collection, id) => collection.find((item) => item.id === id)?.name ?? null;
  // { outcome, left, top } — anchored in viewport coordinates so the menu is
  // never clipped by the scroll container.
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    // Capture phase: catch scrolls on the tree container, not just the window.
    window.addEventListener('scroll', close, true);
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('pointerdown', close);
    };
  }, [menu]);

  function openMenu(event, outcome) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ outcome, left: rect.right + 6, top: rect.top });
  }

  function choose(kind) {
    const { outcome } = menu;
    setMenu(null);
    onAdd(outcome, kind);
  }

  return (
    <div className="tree-scroll">
      <svg className="tree" width={width} height={height} role="tree" aria-label="Outcome tree">
        <defs>
          <marker
            id="tree-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path className="tree-arrowhead" d="M0 1.5 L7 4 L0 6.5 z" />
          </marker>
        </defs>

        {edges.map((edge) => (
          <line
            key={edge.key}
            className="tree-edge"
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            markerEnd="url(#tree-arrow)"
          />
        ))}

        {nodes.map(({ outcome, x, y, depth }) => {
          const lines = wrapLabel(outcome.name);
          const team = nameOf(teams, outcome.team_id);
          const linked = projectsForOutcome(projects, outcome);
          const quantified = targetsForOutcome(targets, outcome);
          const readings = measurementsForOutcome(measurements, targets, outcome);
          // An outcome with no target can't be settled by evidence, so it is
          // drawn differently rather than looking finished.
          const className = ['tree-node', depth === 0 && 'root', quantified.length === 0 && 'unquantified']
            .filter(Boolean)
            .join(' ');
          return (
            <g
              key={outcome.id}
              className={className}
              role="treeitem"
              aria-level={depth + 1}
              tabIndex={0}
              onClick={() => onEdit(outcome)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onEdit(outcome);
                }
              }}
            >
              <title>
                {[
                  outcome.name,
                  team && `Team: ${team}`,
                  linked.length > 0 && `Projects: ${linked.map((item) => item.name).join(', ')}`,
                  quantified.length > 0
                    ? `Targets: ${quantified
                        .map((item) => `${item.name} (${item.baseline_value} → ${item.target_value} ${item.unit})`)
                        .join(', ')}`
                    : 'No target yet',
                  readings.length > 0 && `Measurements: ${readings.length}`,
                  outcome.description,
                ]
                  .filter(Boolean)
                  .join('\n')}
              </title>
              <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
              <text x={x} y={y + NODE_H / 2} textAnchor="middle" dominantBaseline="middle">
                {lines.map((line, index) => (
                  <tspan key={index} x={x} dy={index === 0 ? -((lines.length - 1) * LINE_H) / 2 : LINE_H}>
                    {line}
                  </tspan>
                ))}
              </text>

              {/* Revealed on hover or keyboard focus; opens the add menu. */}
              <g
                className="node-add"
                role="button"
                tabIndex={0}
                aria-label={`Add to ${outcome.name}`}
                onClick={(event) => openMenu(event, outcome)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    openMenu(event, outcome);
                  }
                }}
              >
                <circle cx={x + NODE_W / 2} cy={y + NODE_H / 2} r="11" />
                <path
                  d={`M${x + NODE_W / 2 - 5} ${y + NODE_H / 2}h10M${x + NODE_W / 2} ${
                    y + NODE_H / 2 - 5
                  }v10`}
                />
              </g>
            </g>
          );
        })}
      </svg>

      {menu && (
        <div
          className="node-menu"
          style={{ left: menu.left, top: menu.top }}
          role="menu"
          aria-label={`Add to ${menu.outcome.name}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="node-menu-head">Add to “{menu.outcome.name}”</p>
          <button type="button" role="menuitem" onClick={() => choose('outcome')}>
            Child outcome
          </button>
          <button type="button" role="menuitem" onClick={() => choose('target')}>
            Target
          </button>
          <button type="button" role="menuitem" onClick={() => choose('measurement')}>
            Measurement
          </button>
          <button type="button" role="menuitem" onClick={() => choose('project')}>
            Project
          </button>
        </div>
      )}
    </div>
  );
}

function layout(outcomes) {
  const byParent = new Map();
  for (const outcome of outcomes) {
    const key = outcome.parent_outcome_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(outcome);
  }

  const nodes = [];
  const edges = [];
  const placed = new Set(); // guards against a parent cycle the API doesn't reject
  let maxDepth = 0;

  function place(outcome, depth, left) {
    placed.add(outcome.id);
    maxDepth = Math.max(maxDepth, depth);
    const y = PAD + depth * LEVEL_H;
    const children = (byParent.get(outcome.id) ?? []).filter((child) => !placed.has(child.id));

    let x;
    let right;
    const childPositions = [];

    if (children.length === 0) {
      x = left + NODE_W / 2;
      right = left + NODE_W;
    } else {
      let childLeft = left;
      for (const child of children) {
        const position = place(child, depth + 1, childLeft);
        childPositions.push(position);
        childLeft = position.right + H_GAP;
      }
      right = childLeft - H_GAP;
      x = (childPositions[0].x + childPositions[childPositions.length - 1].x) / 2;
    }

    nodes.push({ outcome, x, y, depth });
    for (const child of childPositions) {
      edges.push({
        key: `${outcome.id}-${child.id}`,
        x1: x,
        y1: y + NODE_H,
        x2: child.x,
        y2: child.y - 3,
      });
    }

    return { id: outcome.id, x, y, right };
  }

  // An outcome whose parent isn't in the set (filtered out, or a stale id) is
  // rendered as a root rather than silently dropped.
  const present = new Set(outcomes.map((outcome) => outcome.id));
  const roots = outcomes.filter(
    (outcome) => outcome.parent_outcome_id == null || !present.has(outcome.parent_outcome_id)
  );

  let left = PAD;
  for (const root of roots) {
    if (placed.has(root.id)) continue;
    const position = place(root, 0, left);
    left = position.right + H_GAP * 2;
  }

  return {
    nodes,
    edges,
    width: Math.max(left - H_GAP * 2 + PAD, NODE_W + PAD * 2),
    height: PAD * 2 + maxDepth * LEVEL_H + NODE_H,
  };
}

// SVG has no text wrapping, so lines are split on an approximate character
// budget for the node width and the overflow is clipped with an ellipsis.
function wrapLabel(text, maxChars = MAX_CHARS, maxLines = MAX_LINES) {
  // A single word wider than the box can't be wrapped on a space, so it is
  // hard-broken rather than left to spill outside the node.
  const words = String(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) =>
      word.length <= maxChars ? word : (word.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [])
    );
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`;
  return kept;
}
