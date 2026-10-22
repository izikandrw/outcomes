import { useEffect, useState } from 'react';
import {
  insightsForOutcome,
  insightsForProject,
  measurementsForOutcome,
  projectsForOutcome,
  targetsForOutcome,
} from '../lib/links.js';

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
  insights,
  onEdit,
  onEditProject,
  onShowInsights,
  onAdd,
  onDelete,
  onDeleteProject,
}) {
  const { nodes, edges, width, height } = layout(outcomes, projects);
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
          <marker
            id="tree-arrow-project"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path className="tree-arrowhead project" d="M0 1.5 L7 4 L0 6.5 z" />
          </marker>
        </defs>

        {edges.map((edge) => (
          <path
            key={edge.key}
            className={['tree-edge', edge.kind === 'project' && 'project'].filter(Boolean).join(' ')}
            d={edge.d}
            fill="none"
            markerEnd={edge.kind === 'project' ? 'url(#tree-arrow-project)' : 'url(#tree-arrow)'}
          />
        ))}

        {nodes.map((node) =>
          node.type === 'project' ? (
            <ProjectNode
              key={`project-${node.data.id}`}
              project={node.data}
              teams={teams}
              insightCount={insightsForProject(insights, node.data).length}
              onShowInsights={onShowInsights}
              onEdit={onEditProject}
              onDelete={onDeleteProject}
              {...node}
            />
          ) : (
            <OutcomeNode
              key={`outcome-${node.data.id}`}
              outcome={node.data}
              teams={teams}
              projects={projects}
              targets={targets}
              measurements={measurements}
              insightCount={insightsForOutcome(insights, node.data).length}
              onShowInsights={onShowInsights}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenMenu={openMenu}
              {...node}
            />
          )
        )}
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
          <button type="button" role="menuitem" onClick={() => choose('insight')}>
            Insight
          </button>
        </div>
      )}
    </div>
  );
}

function OutcomeNode({
  outcome,
  x,
  y,
  depth,
  teams,
  projects,
  targets,
  measurements,
  insightCount,
  onShowInsights,
  onEdit,
  onDelete,
  onOpenMenu,
}) {
  const nameOf = (collection, id) => collection.find((item) => item.id === id)?.name ?? null;
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
        onClick={(event) => onOpenMenu(event, outcome)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onOpenMenu(event, outcome);
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
      <InsightPill x={x} y={y} count={insightCount} label={outcome.name} onOpen={() => onShowInsights(outcome, 'outcome')} />
      <DeleteButton x={x} y={y} label={outcome.name} onDelete={() => onDelete(outcome)} />
    </g>
  );
}

// Always visible, bottom-left of the node: how many insights back it up.
function InsightPill({ x, y, count, label, onOpen }) {
  const cx = x - NODE_W / 2 + 18;
  const cy = y + NODE_H;
  return (
    <g
      className={['node-insights', count === 0 && 'empty'].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      aria-label={`${count} insight${count === 1 ? '' : 's'} for ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }
      }}
    >
      <rect x={cx - 16} y={cy - 9} width="32" height="18" rx="9" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
        💡{count}
      </text>
    </g>
  );
}

// Revealed on hover or keyboard focus, like the add button.
function DeleteButton({ x, y, label, onDelete }) {
  const cx = x + NODE_W / 2 - 4;
  const cy = y + 4;
  return (
    <g
      className="node-delete"
      role="button"
      tabIndex={0}
      aria-label={`Delete ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onDelete();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }
      }}
    >
      <circle cx={cx} cy={cy} r="9" />
      <path d={`M${cx - 3.5} ${cy - 3.5}l7 7M${cx + 3.5} ${cy - 3.5}l-7 7`} />
    </g>
  );
}

// A project is a leaf with no children of its own here, so it gets no
// add-menu, but it opens the same edit modal an outcome does.
function ProjectNode({ project, x, y, depth, teams, insightCount, onShowInsights, onEdit, onDelete }) {
  const team = teams.find((item) => item.id === project.team_id)?.name ?? null;
  // Reserve the last line for the team badge so it doesn't get squeezed out
  // by a long project name.
  const nameLines = wrapLabel(project.name, MAX_CHARS, team ? MAX_LINES - 1 : MAX_LINES);
  const [teamLine] = team ? wrapLabel(team, MAX_CHARS, 1) : [null];
  const lines = teamLine ? [...nameLines, teamLine] : nameLines;
  const teamLineIndex = teamLine ? lines.length - 1 : -1;

  return (
    <g
      className="tree-node project"
      role="treeitem"
      aria-level={depth + 1}
      tabIndex={0}
      onClick={() => onEdit(project)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit(project);
        }
      }}
    >
      <title>
        {[project.name, team && `Team: ${team}`, project.description].filter(Boolean).join('\n')}
      </title>
      <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
      <text x={x} y={y + NODE_H / 2} textAnchor="middle" dominantBaseline="middle">
        {lines.map((line, index) => (
          <tspan
            key={index}
            className={index === teamLineIndex ? 'tree-node-team' : undefined}
            x={x}
            dy={index === 0 ? -((lines.length - 1) * LINE_H) / 2 : LINE_H}
          >
            {line}
          </tspan>
        ))}
      </text>
      <InsightPill x={x} y={y} count={insightCount} label={project.name} onOpen={() => onShowInsights(project, 'project')} />
      <DeleteButton x={x} y={y} label={project.name} onDelete={() => onDelete(project)} />
    </g>
  );
}

// Places outcomes as a node-link tree, then hangs each project as a leaf
// under the first outcome (in list order) it drives. A project linked to more
// than one outcome is still drawn once — the other outcomes it drives get a
// dashed cross-edge to that same node instead of a duplicate.
function layout(outcomes, projects) {
  const byParent = new Map();
  for (const outcome of outcomes) {
    const key = outcome.parent_outcome_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(outcome);
  }

  const primaryOutcomeOf = new Map(); // project.id -> outcome.id it's drawn under
  const projectsByOutcome = new Map(); // outcome.id -> project[] drawn under it
  for (const outcome of outcomes) {
    for (const project of projectsForOutcome(projects, outcome)) {
      if (primaryOutcomeOf.has(project.id)) continue;
      primaryOutcomeOf.set(project.id, outcome.id);
      if (!projectsByOutcome.has(outcome.id)) projectsByOutcome.set(outcome.id, []);
      projectsByOutcome.get(outcome.id).push(project);
    }
  }

  const nodes = [];
  const edges = [];
  const placed = new Set(); // guards against a parent cycle the API doesn't reject
  let maxDepth = 0;

  function place(item, depth, left) {
    maxDepth = Math.max(maxDepth, depth);
    const y = PAD + depth * LEVEL_H;

    if (item.kind === 'project') {
      const x = left + NODE_W / 2;
      nodes.push({ type: 'project', data: item.data, x, y, depth });
      return { id: item.data.id, x, y, right: left + NODE_W };
    }

    const outcome = item.data;
    placed.add(outcome.id);
    const childOutcomes = (byParent.get(outcome.id) ?? []).filter((child) => !placed.has(child.id));
    const childProjects = projectsByOutcome.get(outcome.id) ?? [];
    const children = [
      ...childOutcomes.map((child) => ({ kind: 'outcome', data: child })),
      ...childProjects.map((project) => ({ kind: 'project', data: project })),
    ];

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
        childPositions.push({ ...position, kind: child.kind });
        childLeft = position.right + H_GAP;
      }
      right = childLeft - H_GAP;
      x = (childPositions[0].x + childPositions[childPositions.length - 1].x) / 2;
    }

    nodes.push({ type: 'outcome', data: outcome, x, y, depth });
    for (const child of childPositions) {
      edges.push({
        key: `${outcome.id}-${child.kind}-${child.id}`,
        d: elbowPath(x, y + NODE_H, child.x, child.y - 3),
        kind: child.kind,
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
    const position = place({ kind: 'outcome', data: root }, 0, left);
    left = position.right + H_GAP * 2;
  }

  const outcomeNodeById = new Map(
    nodes.filter((node) => node.type === 'outcome').map((node) => [node.data.id, node])
  );
  const projectNodeById = new Map(
    nodes.filter((node) => node.type === 'project').map((node) => [node.data.id, node])
  );
  for (const outcome of outcomes) {
    for (const project of projectsForOutcome(projects, outcome)) {
      if (String(primaryOutcomeOf.get(project.id)) === String(outcome.id)) continue;
      const from = outcomeNodeById.get(outcome.id);
      const to = projectNodeById.get(project.id);
      if (!from || !to) continue;
      edges.push({
        key: `${outcome.id}-project-${project.id}-cross`,
        d: crossLinkPath(from, to),
        kind: 'project',
      });
    }
  }

  return {
    nodes,
    edges,
    width: Math.max(left - H_GAP * 2 + PAD, NODE_W + PAD * 2),
    height: PAD * 2 + maxDepth * LEVEL_H + NODE_H,
  };
}

// Right-angle connector: drops straight down from the parent, jogs sideways
// only in the empty gap between rows, then drops straight into the child.
// A straight diagonal here would cross through whichever sibling sits between
// the parent's centred x (averaged over all its children) and this one.
function elbowPath(x1, y1, x2, y2) {
  if (x1 === x2) return `M${x1} ${y1} V${y2}`;
  const midY = (y1 + y2) / 2;
  return `M${x1} ${y1} V${midY} H${x2} V${y2}`;
}

// A project cross-linked from an outcome it isn't primarily drawn under can
// land in the same row as that outcome (or even a shallower one) rather than
// strictly below it, since its row is fixed by whichever outcome claimed it
// first. The normal top-to-bottom elbow assumes the target is below the
// source, so on overlapping rows it would cut a line straight through the
// boxes in between. When rows overlap, dip a few pixels under both boxes
// instead so the connector never crosses node interiors.
function crossLinkPath(from, to) {
  const rowsOverlap = from.y < to.y + NODE_H && to.y < from.y + NODE_H;
  if (rowsOverlap) {
    const dipY = Math.max(from.y, to.y) + NODE_H + 10;
    return `M${from.x} ${from.y + NODE_H} V${dipY} H${to.x} V${to.y + NODE_H}`;
  }
  if (from.y < to.y) return elbowPath(from.x, from.y + NODE_H, to.x, to.y - 3);
  return elbowPath(from.x, from.y - 3, to.x, to.y + NODE_H);
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
