import { useEffect, useState } from 'react';
import {
  insightsForOutcome,
  insightsForProject,
  totalDollarImpact,
  formatDollars,
  measurementsForOutcome,
  outcomesForImpact,
  projectsForOutcome,
  targetsForImpact,
  targetsForOutcome,
  teamsOnOutcome,
  teamsOnProject,
  formatQuarter,
  targetRange,
} from '../lib/links.js';
import { groupByRule, issuesFor, validateTree } from '../lib/validation.js';

export const NODE_W = 160;
export const NODE_H = 68;
// Nodes with an insight pill straddle their bottom edge; lift the label to clear it.
const LABEL_LIFT = 4;
export const H_GAP = 24; // between sibling subtrees
export const V_GAP = 54; // between a node's bottom edge and its children's top edge
export const LEVEL_H = NODE_H + V_GAP;
export const PAD = 20;
export const LINE_H = 15;
export const MAX_CHARS = 21;
const MAX_LINES = 3;

// Top-down node-link diagram: each node is centred over the block its children
// occupy, so sibling subtrees never overlap however wide they fan out.
export default function OutcomeTree({
  impacts = [],
  outcomes,
  teams,
  projects,
  targets,
  measurements,
  insights,
  onEdit,
  onEditImpact,
  onViewTarget,
  onEditProject,
  onShowInsights,
  onAdd,
  onAddChildProject,
  onUnlink,
  onOpenTeam,
  onShowIssue,
}) {
  const { nodes, edges, width, height } = layout(outcomes, projects, impacts);
  const validation = validateTree({ outcomes, projects, insights, impacts });
  const counts = groupByRule(validation, { impacts, outcomes, projects });
  // { entity, kind, left, top } — kind is 'outcome' or 'impact'. Anchored in
  // viewport coordinates so the menu is never clipped by the scroll container.
  const [menu, setMenu] = useState(null);
  // The relationship line under the pointer; its two end nodes glow and it
  // shows a button to break the link.
  const [hoverEdge, setHoverEdge] = useState(null);
  const hoverEnds = hoverEdge?.ends;

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

  function openMenu(event, entity, kind = 'outcome') {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ entity, kind, left: rect.right + 6, top: rect.top });
  }

  function choose(kind) {
    const { entity, kind: parentKind } = menu;
    setMenu(null);
    onAdd(entity, kind, parentKind);
  }

  return (
    <div className="tree-scroll">
      <section className="validation-panel" aria-label="Validation">
        {counts.map(({ rule, items }) => (
          <div
            key={rule.id}
            className={['validation-stat', items.length === 0 && 'ok'].filter(Boolean).join(' ')}
            title={rule.description}
          >
            <span className="validation-count">
              {rule.emoji} {items.length}
            </span>
            <span className="validation-label">{rule.title}</span>
          </div>
        ))}
      </section>
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
            id="tree-arrow-impact"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path className="tree-arrowhead impact" d="M0 1.5 L7 4 L0 6.5 z" />
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
          <g
            key={edge.key}
            onMouseEnter={() => setHoverEdge(edge)}
            onMouseLeave={() => setHoverEdge(null)}
          >
            <path
              className={['tree-edge', edge.kind !== 'outcome' && edge.kind].filter(Boolean).join(' ')}
              d={edge.d}
              fill="none"
              markerEnd={
                edge.kind === 'project'
                  ? 'url(#tree-arrow-project)'
                  : edge.kind === 'impact'
                    ? 'url(#tree-arrow-impact)'
                    : 'url(#tree-arrow)'
              }
            />
            {/* Wider invisible stroke so the thin line is easy to hover. */}
            <path className="tree-edge-hit" d={edge.d} fill="none" />
            {/* A target can't exist without its outcome, so that link has no break button. */}
            {hoverEdge?.key === edge.key && edge.kind !== 'target' && (
              <g
                className="edge-unlink"
                role="button"
                tabIndex={0}
                aria-label="Remove link"
                onClick={(event) => {
                  event.stopPropagation();
                  setHoverEdge(null);
                  onUnlink(edge);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setHoverEdge(null);
                    onUnlink(edge);
                  }
                }}
              >
                <title>Remove link</title>
                <circle cx={edge.button.x} cy={edge.button.y} r="9" />
                <path
                  d={`M${edge.button.x - 3.5} ${edge.button.y - 3.5}l7 7M${edge.button.x + 3.5} ${
                    edge.button.y - 3.5
                  }l-7 7`}
                />
              </g>
            )}
          </g>
        ))}

        {nodes.map((node) => (
          <g
            key={`${node.type}-${node.data.id}`}
            className={hoverEnds?.includes(`${node.type}-${node.data.id}`) ? 'edge-hover' : undefined}
          >
          {node.type === 'impact' ? (
            <ImpactNode
              key={`impact-${node.data.id}`}
              impact={node.data}
              issues={issuesFor(validation, 'impact', node.data)}
              targets={targets}
              onEdit={onEditImpact}
              onViewTarget={onViewTarget}
              onOpenMenu={openMenu}
              onShowIssue={onShowIssue}
              {...node}
            />
          ) : node.type === 'project' ? (
            <ProjectNode
              key={`project-${node.data.id}`}
              project={node.data}
              teams={teams}
              teamEntries={teamsOnProject(projects, node.data)}
              onOpenTeam={onOpenTeam}
              onShowIssue={onShowIssue}
              insightCount={insightsForProject(insights, node.data).length}
              insightDollars={totalDollarImpact(insightsForProject(insights, node.data))}
              issues={issuesFor(validation, 'project', node.data)}
              onShowInsights={onShowInsights}
              onEdit={onEditProject}
              onAddChild={onAddChildProject}
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
              teamEntries={teamsOnOutcome(outcomes, projects, node.data)}
              onOpenTeam={onOpenTeam}
              onShowIssue={onShowIssue}
              insightCount={insightsForOutcome(insights, node.data).length}
              insightDollars={totalDollarImpact(insightsForOutcome(insights, node.data))}
              issues={issuesFor(validation, 'outcome', node.data)}
              onShowInsights={onShowInsights}
              onEdit={onEdit}
              onViewTarget={onViewTarget}
              onOpenMenu={openMenu}
              {...node}
            />
          )}
          </g>
        ))}
      </svg>

      {menu && (
        <div
          className="node-menu"
          style={{ left: menu.left, top: menu.top }}
          role="menu"
          aria-label={`Add to ${menu.entity.name}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="node-menu-head">Add to “{menu.entity.name}”</p>
          {menu.kind === 'impact' ? (
            <>
              <button type="button" role="menuitem" onClick={() => choose('impact')}>
                🏔️ Child impact
              </button>
              <button type="button" role="menuitem" onClick={() => choose('outcome')}>
                🌱 Outcome
              </button>
              <button type="button" role="menuitem" onClick={() => choose('target')}>
                🎯 Target
              </button>
              <button type="button" role="menuitem" onClick={() => choose('measurement')}>
                📈 Measurement
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => choose('outcome')}>
                🌱 Child outcome
              </button>
              <button type="button" role="menuitem" onClick={() => choose('target')}>
                🎯 Target
              </button>
              <button type="button" role="menuitem" onClick={() => choose('measurement')}>
                📈 Measurement
              </button>
              <button type="button" role="menuitem" onClick={() => choose('project')}>
                🚀 Project
              </button>
              <button type="button" role="menuitem" onClick={() => choose('insight')}>
                💡 Insight
              </button>
            </>
          )}
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
  teamEntries,
  onOpenTeam,
  onShowIssue,
  insightCount,
  insightDollars,
  issues,
  onShowInsights,
  onEdit,
  onViewTarget,
  onOpenMenu,
}) {
  const nameOf = (collection, id) => collection.find((item) => item.id === id)?.name ?? null;
  const team = nameOf(teams, outcome.team_id);
  const linked = projectsForOutcome(projects, outcome);
  const quantified = targetsForOutcome(targets, outcome);
  const { lines, targetLine } = nodeLabel(outcome.name, quantified);
  const readings = measurementsForOutcome(measurements, targets, outcome);
  const className = [
    'tree-node',
    outcome.parent_outcome_id == null && 'root',
    issues.length > 0 && 'has-issue',
  ]
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
                .map((item) => (item.name ? `${item.name} (${targetRange(item)})` : targetRange(item)))
                .join(', ')}`
            : 'No target yet',
          readings.length > 0 && `Measurements: ${readings.length}`,
          ...issues.map((rule) => `${rule.emoji} ${rule.title}: ${rule.description}`),
          outcome.description,
        ]
          .filter(Boolean)
          .join('\n')}
      </title>
      <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
      <NodeText
        x={x}
        y={y}
        lines={lines}
        targetLine={targetLine}
        lift={LABEL_LIFT}
        onTargetClick={() => onViewTarget(quantified[0])}
      />

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
      <IssueBadges x={x} y={y} issues={issues} onOpen={(rule) => onShowIssue(rule, outcome)} />
      <InsightPill x={x} y={y} count={insightCount} dollars={insightDollars} label={outcome.name} onOpen={() => onShowInsights(outcome, 'outcome')} />
    </g>
  );
}

// The business result at the top of the tree. Click edits it; the hover "+"
// adds a child impact, an outcome driving it, or a target measuring it.
function ImpactNode({ impact, x, y, depth, targets, issues, onShowIssue, onEdit, onViewTarget, onOpenMenu }) {
  const quantified = targetsForImpact(targets, impact);
  const { lines, targetLine } = nodeLabel(impact.name, quantified);

  return (
    <g
      className={['tree-node impact', issues.length > 0 && 'has-issue'].filter(Boolean).join(' ')}
      role="treeitem"
      aria-level={depth + 1}
      tabIndex={0}
      onClick={() => onEdit(impact)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit(impact);
        }
      }}
    >
      <title>
        {[
          impact.name,
          quantified.length > 0
            ? `Targets: ${quantified
                .map((item) => (item.name ? `${item.name} (${targetRange(item)})` : targetRange(item)))
                .join(', ')}`
            : 'No target yet',
          impact.description,
          ...issues.map((rule) => `${rule.emoji} ${rule.title}: ${rule.description}`),
        ]
          .filter(Boolean)
          .join('\n')}
      </title>
      <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
      <NodeText
        x={x}
        y={y}
        lines={lines}
        targetLine={targetLine}
        onTargetClick={() => onViewTarget(quantified[0])}
      />
      <IssueBadges x={x} y={y} issues={issues} onOpen={(rule) => onShowIssue(rule, impact)} />

      <g
        className="node-add"
        role="button"
        tabIndex={0}
        aria-label={`Add to ${impact.name}`}
        onClick={(event) => onOpenMenu(event, impact, 'impact')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onOpenMenu(event, impact, 'impact');
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
}

// Straddles the node's top edge, top-left: one emoji per delivery rule the node
// breaks. Hovering shows the rule (native SVG tooltip); clicking opens a modal
// explaining the problem.
function IssueBadges({ x, y, issues, onOpen }) {
  return issues.map((rule, index) => (
    <g
      key={rule.id}
      className="node-issue"
      role="button"
      tabIndex={0}
      aria-label={`${rule.title}: ${rule.description}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(rule);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onOpen(rule);
        }
      }}
    >
      <title>{`${rule.title}\n${rule.description}`}</title>
      <circle cx={x - NODE_W / 2 + 12 + index * 24} cy={y} r="11" />
      <text x={x - NODE_W / 2 + 12 + index * 24} y={y} textAnchor="middle" dominantBaseline="central">
        {rule.emoji}
      </text>
    </g>
  ));
}

// Always visible, bottom-left of the node: how many insights back it up.
function InsightPill({ x, y, count, dollars, label, onOpen }) {
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
      {dollars != null && (
        <>
          <rect x={cx + 22} y={cy - 9} width={formatDollars(dollars).length * 7 + 12} height="18" rx="9" />
          <text x={cx + 28 + (formatDollars(dollars).length * 7) / 2} y={cy} textAnchor="middle" dominantBaseline="central">
            {formatDollars(dollars)}
          </text>
        </>
      )}
    </g>
  );
}

// Opens the same edit modal an outcome does; its hover "+" adds a child
// project directly, since that is the only thing that can hang under one.
function ProjectNode({
  project,
  x,
  y,
  depth,
  teams,
  teamEntries,
  onOpenTeam,
  onShowIssue,
  insightCount,
  insightDollars,
  issues,
  onShowInsights,
  onEdit,
  onAddChild,
}) {
  const team = teams.find((item) => item.id === project.team_id)?.name ?? null;
  const quarter = formatQuarter(project.end_at);
  const lines = wrapLabel(project.name, MAX_CHARS, MAX_LINES);

  return (
    <g
      className={['tree-node project', issues.length > 0 && 'has-issue'].filter(Boolean).join(' ')}
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
        {[
          project.name,
          team && `Team: ${team}`,
          quarter && `Ends: ${quarter}`,
          ...issues.map((rule) => `${rule.emoji} ${rule.title}: ${rule.description}`),
          project.description,
        ]
          .filter(Boolean)
          .join('\n')}
      </title>
      <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
      <text x={x} y={y + NODE_H / 2 - LABEL_LIFT} textAnchor="middle" dominantBaseline="middle">
        {lines.map((line, index) => (
          <tspan
            key={index}
            x={x}
            dy={index === 0 ? -((lines.length - 1) * LINE_H) / 2 : LINE_H}
          >
            {line}
          </tspan>
        ))}
      </text>

      {quarter && (
        <g className="quarter-pill">
          <rect x={x + NODE_W / 2 - 54} y={y + NODE_H - 8} width="48" height="16" rx="8" />
          <text x={x + NODE_W / 2 - 30} y={y + NODE_H} textAnchor="middle" dominantBaseline="central">
            {quarter}
          </text>
        </g>
      )}

      <g
        className="node-add"
        role="button"
        tabIndex={0}
        aria-label={`Add child project to ${project.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onAddChild(project);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onAddChild(project);
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
      <IssueBadges x={x} y={y} issues={issues} onOpen={(rule) => onShowIssue(rule, project)} />
      <InsightPill x={x} y={y} count={insightCount} dollars={insightDollars} label={project.name} onOpen={() => onShowInsights(project, 'project')} />
    </g>
  );
}

// An outcome or impact states its targets inside its own node: the name takes
// up to two lines and the last line is its first target's numbers, with "+N"
// when it owns more. Without targets the name gets all three lines.
function nodeLabel(name, quantified) {
  if (quantified.length === 0) return { lines: wrapLabel(name), targetLine: null };
  const extra = quantified.length > 1 ? ` +${quantified.length - 1}` : '';
  const [targetLine] = wrapLabel(`${targetRange(quantified[0])}${extra}`, MAX_CHARS, 1);
  return { lines: wrapLabel(name, MAX_CHARS, MAX_LINES - 1), targetLine };
}

// Clicking the target line opens that target's measurements instead of the
// node's edit form; with several targets it is the first one, the one shown.
function NodeText({ x, y, lines, targetLine, lift = 0, onTargetClick }) {
  const all = targetLine ? [...lines, targetLine] : lines;
  return (
    <text x={x} y={y + NODE_H / 2 - lift} textAnchor="middle" dominantBaseline="middle">
      {all.map((line, index) => (
        <tspan
          key={index}
          className={targetLine && index === all.length - 1 ? 'tree-node-target' : undefined}
          onClick={
            targetLine && index === all.length - 1
              ? (event) => {
                  event.stopPropagation();
                  onTargetClick();
                }
              : undefined
          }
          x={x}
          dy={index === 0 ? -((all.length - 1) * LINE_H) / 2 : LINE_H}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

// Places impacts at the top, then outcomes as a node-link tree, then hangs each project as a node
// under the first outcome (in list order) it drives, or under its parent
// project when it has one. A project linked to more than one outcome is still
// drawn once — the other outcomes it drives get a cross-edge to that
// same node instead of a duplicate.
function layout(outcomes, projects, impacts) {
  const byParent = new Map();
  for (const outcome of outcomes) {
    const key = outcome.parent_outcome_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(outcome);
  }

  // A project whose parent isn't in the set is drawn as if it had none.
  const presentProjects = new Set(projects.map((project) => String(project.id)));
  const nestedUnder = (project) =>
    project.parent_project_id != null && presentProjects.has(String(project.parent_project_id));

  const projectsByParent = new Map(); // project.id -> child project[]
  for (const project of projects) {
    if (!nestedUnder(project)) continue;
    const key = String(project.parent_project_id);
    if (!projectsByParent.has(key)) projectsByParent.set(key, []);
    projectsByParent.get(key).push(project);
  }

  const primaryOutcomeOf = new Map(); // project.id -> outcome.id it's drawn under
  const projectsByOutcome = new Map(); // outcome.id -> project[] drawn under it
  for (const outcome of outcomes) {
    for (const project of projectsForOutcome(projects, outcome)) {
      if (nestedUnder(project) || primaryOutcomeOf.has(project.id)) continue;
      primaryOutcomeOf.set(project.id, outcome.id);
      if (!projectsByOutcome.has(outcome.id)) projectsByOutcome.set(outcome.id, []);
      projectsByOutcome.get(outcome.id).push(project);
    }
  }

  const impactsByParent = new Map(); // impact.id -> child impact[]
  const presentImpacts = new Set(impacts.map((impact) => String(impact.id)));
  for (const impact of impacts) {
    if (impact.parent_impact_id == null || !presentImpacts.has(String(impact.parent_impact_id))) continue;
    const key = String(impact.parent_impact_id);
    if (!impactsByParent.has(key)) impactsByParent.set(key, []);
    impactsByParent.get(key).push(impact);
  }

  const nodes = [];
  const edges = [];
  const placedImpacts = new Set();
  const placed = new Set(); // guards against a parent cycle the API doesn't reject
  const placedProjects = new Set();
  let maxDepth = 0;

  function place(item, depth, left) {
    maxDepth = Math.max(maxDepth, depth);
    const y = PAD + depth * LEVEL_H;
    const entity = item.data;

    let children;
    if (item.kind === 'impact') {
      placedImpacts.add(entity.id);
      children = [
        ...(impactsByParent.get(String(entity.id)) ?? [])
          .filter((child) => !placedImpacts.has(child.id))
          .map((child) => ({ kind: 'impact', data: child })),
        // Only top-level outcomes hang off an impact; their children follow
        // them down the outcome tree.
        ...outcomesForImpact(outcomes, entity)
          .filter((child) => child.parent_outcome_id == null && !placed.has(child.id))
          .map((child) => ({ kind: 'outcome', data: child })),
      ];
    } else if (item.kind === 'project') {
      placedProjects.add(entity.id);
      children = (projectsByParent.get(String(entity.id)) ?? [])
        .filter((child) => !placedProjects.has(child.id))
        .map((child) => ({ kind: 'project', data: child }));
    } else {
      placed.add(entity.id);
      const childOutcomes = (byParent.get(entity.id) ?? []).filter((child) => !placed.has(child.id));
      const childProjects = (projectsByOutcome.get(entity.id) ?? []).filter(
        (child) => !placedProjects.has(child.id)
      );
      children = [
        ...childOutcomes.map((child) => ({ kind: 'outcome', data: child })),
        ...childProjects.map((project) => ({ kind: 'project', data: project })),
      ];
    }

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

    nodes.push({ type: item.kind, data: entity, x, y, depth });
    for (const child of childPositions) {
      edges.push({
        key: `${item.kind}-${entity.id}-${child.kind}-${child.id}`,
        d: elbowPath(x, y + NODE_H, child.x, child.y - 3),
        kind: child.kind,
        ends: [`${item.kind}-${entity.id}`, `${child.kind}-${child.id}`],
        from: { kind: item.kind, id: entity.id },
        to: { kind: child.kind, id: child.id },
        button: { x: child.x, y: y + NODE_H + V_GAP / 2 + V_GAP / 4 },
      });
    }

    return { id: entity.id, x, y, right };
  }

  // An outcome whose parent isn't in the set (filtered out, or a stale id) is
  // rendered as a root rather than silently dropped.
  const present = new Set(outcomes.map((outcome) => outcome.id));
  const roots = outcomes.filter(
    (outcome) => outcome.parent_outcome_id == null || !present.has(outcome.parent_outcome_id)
  );

  let left = PAD;
  const impactRoots = impacts.filter(
    (impact) => impact.parent_impact_id == null || !presentImpacts.has(String(impact.parent_impact_id))
  );
  for (const root of impactRoots) {
    if (placedImpacts.has(root.id)) continue;
    const position = place({ kind: 'impact', data: root }, 0, left);
    left = position.right + H_GAP * 2;
  }
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
        ends: [`outcome-${outcome.id}`, `project-${project.id}`],
        from: { kind: 'outcome', id: outcome.id },
        to: { kind: 'project', id: project.id },
        button: crossLinkButton(from, to),
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
export function elbowPath(x1, y1, x2, y2) {
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
// A point on the last vertical run into the project, clear of the shared
// horizontal run so each cross-link gets its own button.
function crossLinkButton(from, to) {
  const rowsOverlap = from.y < to.y + NODE_H && to.y < from.y + NODE_H;
  if (rowsOverlap) {
    const dipY = Math.max(from.y, to.y) + NODE_H + 10;
    return { x: to.x, y: (dipY + to.y + NODE_H) / 2 + 1 };
  }
  if (from.y < to.y) return { x: to.x, y: to.y - V_GAP / 4 };
  return { x: to.x, y: to.y + NODE_H + V_GAP / 4 };
}

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
export function wrapLabel(text, maxChars = MAX_CHARS, maxLines = MAX_LINES) {
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
