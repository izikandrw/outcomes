import { useEffect, useMemo, useRef, useState } from 'react';
import {
  insightsForOutcome,
  insightsForProject,
  linkBetween,
  totalDollarImpact,
  formatDollars,
  outcomesForImpact,
  projectsForOutcome,
  targetsForImpact,
  targetsForOutcome,
  teamsOnOutcome,
  teamsOnProject,
  formatQuarter,
  targetRange,
} from '../lib/links.js';
import { issuesFor, validateTree } from '../lib/validation.js';
import { useZoom, ZoomControls } from './Zoom.jsx';

export const NODE_W = 160;
export const NODE_H = 83;
// Nodes with an insight pill straddle their bottom edge; lift the label to clear it.
const LABEL_LIFT = 4;
export const H_GAP = 24; // between sibling subtrees
export const V_GAP = 54; // between a node's bottom edge and its children's top edge
export const LEVEL_H = NODE_H + V_GAP;
export const PAD = 20;
// How far the issue badges and insight pills stick out past a node's top and
// bottom edges, and the gap a connector keeps from them.
const BADGE_REACH = 11;
const LINE_CLEARANCE = 8;
// How far a cross-link's vertical run keeps from the sides of nodes it passes.
const CHANNEL_CLEARANCE = 4;
export const LINE_H = 15;
// A revealed name's lines level with the insight pill start past its right
// end: how near a line's centre can come to the pill's before it must, and the
// rough width of a character used to shorten those lines.
const PILL_BAND = 17;
const CHAR_W = 7;
const TEXT_INSET = 6;
export const MAX_CHARS = 21;
const MAX_LINES = 4;
// How far the pointer must travel with the button down before a press on a
// node turns into dragging a link from it rather than a click.
const DRAG_THRESHOLD = 5;

// Top-down node-link diagram: each node is centred over the block its children
// occupy, so sibling subtrees never overlap however wide they fan out.
export default function OutcomeTree({
  impacts = [],
  outcomes,
  projects,
  targets,
  insights,
  onEdit,
  onEditImpact,
  onViewTarget,
  onEditProject,
  onShowInsights,
  onAdd,
  onAddChildProject,
  onUnlink,
  onLink,
  onOpenTeam,
  onShowIssue,
}) {
  const { nodes, edges, width, height: treeHeight } = useMemo(
    () => layout(outcomes, projects, impacts),
    [outcomes, projects, impacts]
  );
  // Room below the bottom row for a long name's overlay.
  const dollarsOf = (node) =>
    node.type === 'impact'
      ? null
      : totalDollarImpact(
          node.type === 'project' ? insightsForProject(insights, node.data) : insightsForOutcome(insights, node.data)
        );
  const height = Math.max(
    treeHeight,
    ...nodes.map((node) => node.y + fullNameLayout({ ...node, dollars: dollarsOf(node) }).height + PAD)
  );
  const validation = validateTree({ outcomes, projects, insights, impacts });
  // { entity, kind, left, top } — kind is 'outcome' or 'impact'. Anchored in
  // viewport coordinates so the menu is never clipped by the scroll container.
  const [menu, setMenu] = useState(null);
  // The relationship line under the pointer; its two end nodes glow and it
  // shows a button to break the link.
  const [hoverEdge, setHoverEdge] = useState(null);
  const hoverEnds = hoverEdge?.ends;
  // Clearing waits a tick so the pointer can cross from a line onto its
  // remove button (drawn apart, above the nodes) without the button vanishing.
  const hoverTimer = useRef(null);
  const hoverOn = (edge) => {
    clearTimeout(hoverTimer.current);
    setHoverEdge(edge);
  };
  const hoverOff = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverEdge(null));
  };
  const unlink = (edge) => {
    clearTimeout(hoverTimer.current);
    setHoverEdge(null);
    onUnlink(edge);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  // The key of the node under the pointer whose name is cut short. Its whole
  // name is laid over it under its badges, pill and add button, and it is
  // drawn after every other node so neighbours can't cover that.
  const [revealKey, setRevealKey] = useState(null);
  const keyOf = (node) => `${node.type}-${node.data.id}`;
  const drawOrder = [...nodes].sort((a, b) => (keyOf(a) === revealKey) - (keyOf(b) === revealKey));
  const { zoom, scrollRef, svgRef, ...zoomActions } = useZoom({ storageKey: 'outcomes.mapZoom', width });
  // Dragging from one node to another links them: { from, point, target,
  // link, left, top }, where point is in map coordinates and left/top place
  // the hint in the viewport. `link` is what linkBetween makes of the drop.
  const [linking, setLinking] = useState(null);
  // The click that ends a drag lands on a node, which would open its form.
  const swallowClick = useRef(false);
  // Read by the window listeners a drag adds, which outlive the render that
  // added them.
  const latest = useRef();
  latest.current = { nodes, impacts, outcomes, projects, onLink };

  function startLink(event, from) {
    if (event.button !== 0) return;
    // The node's own buttons keep their clicks.
    if (event.target.closest('.node-add, .node-insights, .node-issue, .tree-node-target')) return;
    const start = { x: event.clientX, y: event.clientY };
    let active = false;
    let cancelled = false;
    let link = null;
    const track = (moved) => {
      const point = new DOMPoint(moved.clientX, moved.clientY).matrixTransform(
        svgRef.current.getScreenCTM().inverse()
      );
      const target =
        latest.current.nodes.find(
          (node) =>
            keyOf(node) !== keyOf(from) &&
            Math.abs(point.x - node.x) <= NODE_W / 2 &&
            point.y >= node.y &&
            point.y <= node.y + NODE_H
        ) ?? null;
      link = target && linkBetween(from, target, latest.current);
      setLinking({ from, point, target, link, left: moved.clientX + 14, top: moved.clientY + 14 });
    };
    const move = (moved) => {
      if (cancelled) return;
      if (!active && Math.hypot(moved.clientX - start.x, moved.clientY - start.y) < DRAG_THRESHOLD) return;
      if (!active) {
        active = true;
        hoverOff();
        setRevealKey(null);
        window.getSelection()?.removeAllRanges();
      }
      track(moved);
    };
    const cancel = () => {
      cancelled = true;
      setLinking(null);
    };
    const onKey = (pressed) => {
      if (pressed.key === 'Escape' && active) cancel();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', onKey);
      if (!active) return;
      swallowClick.current = true;
      setTimeout(() => {
        swallowClick.current = false;
      });
      setLinking(null);
      if (!cancelled && link?.parent) latest.current.onLink(link);
    };
    const abort = () => {
      cancel();
      end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', onKey);
  }

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
    <div>
      <div className="tree-toolbar">
        <ZoomControls zoom={zoom} {...zoomActions} />
      </div>
      <div className="tree-scroll" ref={scrollRef}>
        <svg
          ref={svgRef}
          className="tree"
          width={width * zoom}
          height={height * zoom}
          viewBox={`0 0 ${width} ${height}`}
          role="tree"
          aria-label="Outcome tree"
          onClickCapture={(event) => {
            if (!swallowClick.current) return;
            swallowClick.current = false;
            event.stopPropagation();
          }}
        >
          <defs>
            {/* Anchored short of the tip, where the head is still wider than
                the 1.5px line, so the line's square end is hidden inside it
                instead of poking out past the point. Edges stop 3px short of
                a node to leave room for the tip. */}
            <marker
              id="tree-arrow"
              viewBox="0 0 8 8"
              refX="5"
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
              refX="5"
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
              refX="5"
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
              className={hoverEdge?.key === edge.key ? 'edge-hover' : undefined}
              onMouseEnter={() => hoverOn(edge)}
              onMouseLeave={hoverOff}
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
            </g>
          ))}

          {drawOrder.map((node) => (
            <g
              key={`${node.type}-${node.data.id}`}
              className={
                [
                  hoverEnds?.includes(keyOf(node)) && 'edge-hover',
                  linking && keyOf(linking.from) === keyOf(node) && 'link-source',
                  linking?.target &&
                    keyOf(linking.target) === keyOf(node) &&
                    (linking.link.parent ? 'link-target' : 'link-invalid'),
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onPointerDown={(event) => startLink(event, node)}
              onMouseEnter={() =>
                !linking && setRevealKey(isTruncated(nodeLines(node, targets)) ? keyOf(node) : null)
              }
              onMouseLeave={() => setRevealKey(null)}
            >
            {node.type === 'impact' ? (
              <ImpactNode
                key={`impact-${node.data.id}`}
                impact={node.data}
                revealed={keyOf(node) === revealKey}
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
                revealed={keyOf(node) === revealKey}
                teamEntries={teamsOnProject(projects, node.data)}
                onOpenTeam={onOpenTeam}
                onShowIssue={onShowIssue}
                insightCount={insightsForProject(insights, node.data).length}
                insightDollars={dollarsOf(node)}
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
                revealed={keyOf(node) === revealKey}
                targets={targets}
                teamEntries={teamsOnOutcome(outcomes, projects, node.data)}
                onOpenTeam={onOpenTeam}
                onShowIssue={onShowIssue}
                insightCount={insightsForOutcome(insights, node.data).length}
                insightDollars={dollarsOf(node)}
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
          {linking && (
            <path
              className={['link-preview', linking.link?.reason && 'invalid'].filter(Boolean).join(' ')}
              d={`M${linking.from.x} ${linking.from.y + NODE_H / 2} L${linking.point.x} ${linking.point.y}`}
              markerEnd="url(#tree-arrow)"
            />
          )}
          {/* A target can't exist without its outcome, so that link has no break
              button. Drawn last so no connector or node can cover it; it sits
              outside the edge's group, so it keeps the hover alive itself. */}
          {hoverEdge && !linking && hoverEdge.kind !== 'target' && (
            <g
              className="edge-unlink"
              role="button"
              tabIndex={0}
              aria-label="Remove link"
              onMouseEnter={() => hoverOn(hoverEdge)}
              onMouseLeave={hoverOff}
              onClick={(event) => {
                event.stopPropagation();
                unlink(hoverEdge);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  unlink(hoverEdge);
                }
              }}
            >
              <title>Remove link</title>
              <circle cx={hoverEdge.button.x} cy={hoverEdge.button.y} r="9" />
              <path
                d={`M${hoverEdge.button.x - 3.5} ${hoverEdge.button.y - 3.5}l7 7M${hoverEdge.button.x + 3.5} ${
                  hoverEdge.button.y - 3.5
                }l-7 7`}
              />
            </g>
          )}
        </svg>
      </div>

      {linking?.link && (
        <div
          className={['link-hint', linking.link.reason && 'invalid'].filter(Boolean).join(' ')}
          style={{ left: linking.left, top: linking.top }}
          role="status"
        >
          {linking.link.reason ?? linkHint(linking.link)}
        </div>
      )}

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
  revealed,
  x,
  y,
  depth,
  targets,
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
  const quantified = targetsForOutcome(targets, outcome);
  const { lines, targetLine } = nodeLabel(outcome.name, quantified);
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
      aria-label={outcome.name}
      tabIndex={0}
      onClick={() => onEdit(outcome)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit(outcome);
        }
      }}
    >
      <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
      <NodeText
        x={x}
        y={y}
        lines={lines}
        targetLine={targetLine}
        lift={LABEL_LIFT}
        onTargetClick={() => onViewTarget(quantified[0])}
      />

      {revealed && <FullName node={{ type: 'outcome', data: outcome, x, y, dollars: insightDollars }} />}
      <IssueBadges x={x} y={y} issues={issues} onOpen={(rule) => onShowIssue(rule, outcome)} />
      <InsightPill
        x={x}
        y={y}
        count={insightCount}
        dollars={insightDollars}
        label={outcome.name}
        onOpen={() => onShowInsights(outcome, 'outcome')}
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
    </g>
  );
}

// The business result at the top of the tree. Click edits it; the hover "+"
// adds a child impact, an outcome driving it, or a target measuring it.
function ImpactNode({ impact, revealed, x, y, depth, targets, issues, onShowIssue, onEdit, onViewTarget, onOpenMenu }) {
  const quantified = targetsForImpact(targets, impact);
  const { lines, targetLine } = nodeLabel(impact.name, quantified);

  return (
    <g
      className={['tree-node impact', issues.length > 0 && 'has-issue'].filter(Boolean).join(' ')}
      role="treeitem"
      aria-level={depth + 1}
      aria-label={impact.name}
      tabIndex={0}
      onClick={() => onEdit(impact)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit(impact);
        }
      }}
    >
      <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
      <NodeText
        x={x}
        y={y}
        lines={lines}
        targetLine={targetLine}
        onTargetClick={() => onViewTarget(quantified[0])}
      />
      {revealed && <FullName node={{ type: 'impact', data: impact, x, y }} />}
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
// How far an insight pill reaches in from its node's left edge, so a revealed
// name can flow around it. Mirrors InsightPill's shapes below.
function pillReach(dollars) {
  return dollars == null ? 34 : 52 + formatDollars(dollars).length * 7;
}

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
  revealed,
  x,
  y,
  depth,
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
  const quarter = formatQuarter(project.end_at);
  const lines = wrapLabel(project.name, MAX_CHARS, MAX_LINES);

  return (
    <g
      className={['tree-node project', issues.length > 0 && 'has-issue'].filter(Boolean).join(' ')}
      role="treeitem"
      aria-level={depth + 1}
      aria-label={project.name}
      tabIndex={0}
      onClick={() => onEdit(project)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit(project);
        }
      }}
    >
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

      {revealed && <FullName node={{ type: 'project', data: project, x, y, dollars: insightDollars }} />}
      <IssueBadges x={x} y={y} issues={issues} onOpen={(rule) => onShowIssue(rule, project)} />
      <InsightPill
        x={x}
        y={y}
        count={insightCount}
        dollars={insightDollars}
        label={project.name}
        onOpen={() => onShowInsights(project, 'project')}
      />
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
    </g>
  );
}

// What dropping the dragged link will do, shown beside the pointer.
function linkHint({ parent, child, moves }) {
  const [parentName, childName] = [`“${parent.data.name}”`, `“${child.data.name}”`];
  if (child.type === 'project' && parent.type === 'outcome') return `Link ${childName} to ${parentName}`;
  return `${moves ? 'Move' : 'Put'} ${childName} under ${parentName}`;
}

// An outcome or impact states its targets inside its own node: the name takes
// up to three lines and the last line is its first target's numbers, with "+N"
// when it owns more. Without targets the name gets all four lines.
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
// A project shared by several outcomes is drawn under the deepest of them, so
// every other outcome's link runs down into its top edge instead of climbing
// into it from below. Outcome rows don't depend on where projects go, so a
// first pass finds them and a second places the projects accordingly.
// Siblings then get reordered a few times to cut down crossing lines, and the
// layout with the fewest crossings wins.
const ORDER_PASSES = 4;

function layout(outcomes, projects, impacts) {
  const first = layoutPass(outcomes, projects, impacts, new Map(), new Map());
  const outcomeDepth = new Map(
    first.nodes.filter((node) => node.type === 'outcome').map((node) => [node.data.id, node.depth])
  );
  let best = layoutPass(outcomes, projects, impacts, outcomeDepth, new Map());
  let bestCrossings = countCrossings(best.edges);
  let current = best;
  for (let pass = 0; pass < ORDER_PASSES && bestCrossings > 0; pass += 1) {
    current = layoutPass(outcomes, projects, impacts, outcomeDepth, siblingWeights(current));
    const crossings = countCrossings(current.edges);
    if (crossings < bestCrossings) {
      best = current;
      bestCrossings = crossings;
    }
  }
  return best;
}

// Where each subtree would like to sit: the mean x of the nodes outside it
// that it's linked to — its parent, plus the far end of any cross-link from a
// node inside it. Sorting siblings by this pulls a subtree toward whatever it
// reaches across to, so the line doesn't have to cut past its siblings.
function siblingWeights({ nodes, edges }) {
  const byKey = new Map(nodes.map((node) => [`${node.type}-${node.data.id}`, node]));
  const chain = (key) => {
    const keys = [];
    for (let at = key; at && !keys.includes(at); at = byKey.get(at)?.parent) keys.push(at);
    return keys;
  };
  const pulls = new Map(); // node key -> x positions it's drawn toward
  for (const edge of edges) {
    const [a, b] = edge.ends;
    if (!byKey.has(a) || !byKey.has(b)) continue;
    const up = chain(a);
    const down = chain(b);
    for (const [own, other, otherKey] of [
      [up, down, b],
      [down, up, a],
    ]) {
      for (const key of own) {
        if (other.includes(key)) break;
        if (!pulls.has(key)) pulls.set(key, []);
        pulls.get(key).push(byKey.get(otherKey).x);
      }
    }
  }
  const weights = new Map();
  for (const [key, node] of byKey) {
    const xs = pulls.get(key);
    weights.set(key, xs ? xs.reduce((sum, x) => sum + x, 0) / xs.length : node.x);
  }
  return weights;
}

// How many times one connector's vertical run cuts another's horizontal run.
// Connectors sharing an end meet there by design, so they don't count.
function countCrossings(edges) {
  const runs = edges.map((edge) => {
    const horizontal = [];
    const vertical = [];
    let x = 0;
    let y = 0;
    for (const [, cmd, args] of edge.d.matchAll(/([MVH])([^MVH]*)/g)) {
      const value = args.trim().split(/\s+/).map(Number);
      if (cmd === 'M') [x, y] = value;
      else if (cmd === 'V') {
        vertical.push([x, Math.min(y, value[0]), Math.max(y, value[0])]);
        y = value[0];
      } else {
        horizontal.push([y, Math.min(x, value[0]), Math.max(x, value[0])]);
        x = value[0];
      }
    }
    return { ends: edge.ends, horizontal, vertical };
  });
  const cuts = (a, b) =>
    a.horizontal.reduce(
      (count, [y, x1, x2]) =>
        count + b.vertical.filter(([x, y1, y2]) => x > x1 && x < x2 && y > y1 && y < y2).length,
      0
    );
  let crossings = 0;
  for (let i = 0; i < runs.length; i += 1) {
    for (let j = i + 1; j < runs.length; j += 1) {
      if (runs[i].ends.some((end) => runs[j].ends.includes(end))) continue;
      crossings += cuts(runs[i], runs[j]) + cuts(runs[j], runs[i]);
    }
  }
  return crossings;
}

function layoutPass(outcomes, projects, impacts, outcomeDepth, weights) {
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
  const depthOf = (outcomeId) => outcomeDepth.get(outcomeId) ?? 0;
  for (const outcome of outcomes) {
    for (const project of projectsForOutcome(projects, outcome)) {
      if (nestedUnder(project)) continue;
      const current = primaryOutcomeOf.get(project.id);
      if (current !== undefined && depthOf(outcome.id) <= depthOf(current)) continue;
      primaryOutcomeOf.set(project.id, outcome.id);
    }
  }
  const projectsByOutcome = new Map(); // outcome.id -> project[] drawn under it
  for (const outcome of outcomes) {
    for (const project of projectsForOutcome(projects, outcome)) {
      if (primaryOutcomeOf.get(project.id) !== outcome.id) continue;
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
  // Keeps each kind of child together (the trunk to lowered projects relies
  // on them sitting right of the outcomes) but orders them within it.
  const byWeight = (kind, items) => {
    const weightOf = (entity) => weights.get(`${kind}-${entity.id}`);
    return [...items].sort((a, b) => (weightOf(a) ?? 0) - (weightOf(b) ?? 0));
  };

  function place(item, depth, left, parent = null) {
    maxDepth = Math.max(maxDepth, depth);
    const y = PAD + depth * LEVEL_H;
    const entity = item.data;

    let children;
    if (item.kind === 'impact') {
      placedImpacts.add(entity.id);
      children = [
        ...byWeight(
          'impact',
          (impactsByParent.get(String(entity.id)) ?? []).filter((child) => !placedImpacts.has(child.id))
        ).map((child) => ({ kind: 'impact', data: child })),
        // Only top-level outcomes hang off an impact; their children follow
        // them down the outcome tree.
        ...byWeight(
          'outcome',
          outcomesForImpact(outcomes, entity).filter(
            (child) => child.parent_outcome_id == null && !placed.has(child.id)
          )
        ).map((child) => ({ kind: 'outcome', data: child })),
      ];
    } else if (item.kind === 'project') {
      placedProjects.add(entity.id);
      children = byWeight(
        'project',
        (projectsByParent.get(String(entity.id)) ?? []).filter((child) => !placedProjects.has(child.id))
      ).map((child) => ({ kind: 'project', data: child }));
    } else {
      placed.add(entity.id);
      const childOutcomes = byWeight(
        'outcome',
        (byParent.get(entity.id) ?? []).filter((child) => !placed.has(child.id))
      );
      const childProjects = byWeight(
        'project',
        (projectsByOutcome.get(entity.id) ?? []).filter((child) => !placedProjects.has(child.id))
      );
      // Beside child outcomes, the projects drop a further row so each kind
      // reads as its own grouping instead of sharing one bracket.
      const lowered = childOutcomes.length > 0;
      children = [
        ...childOutcomes.map((child) => ({ kind: 'outcome', data: child })),
        ...childProjects.map((project) => ({ kind: 'project', data: project, lowered })),
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
        const position = place(child, depth + (child.lowered ? 2 : 1), childLeft, `${item.kind}-${entity.id}`);
        childPositions.push({ ...position, kind: child.kind, lowered: child.lowered });
        childLeft = position.right + H_GAP;
      }
      right = childLeft - H_GAP;
      x = (childPositions[0].x + childPositions[childPositions.length - 1].x) / 2;
    }

    nodes.push({ type: item.kind, data: entity, x, y, depth, parent });
    const lowered = childPositions.filter((child) => child.lowered);
    // Lowered projects sit right of every outcome subtree, so a trunk over
    // their centre drops through the outcome row without touching a node.
    const trunkX = lowered.length > 0 ? (lowered[0].x + lowered[lowered.length - 1].x) / 2 : null;
    for (const child of childPositions) {
      edges.push({
        key: `${item.kind}-${entity.id}-${child.kind}-${child.id}`,
        d: child.lowered
          ? loweredPath(x, y + NODE_H, trunkX, child.x, child.y - 3)
          : elbowPath(x, y + NODE_H, child.x, child.y - 3),
        kind: child.kind,
        ends: [`${item.kind}-${entity.id}`, `${child.kind}-${child.id}`],
        from: { kind: item.kind, id: entity.id },
        to: { kind: child.kind, id: child.id },
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
  for (const root of byWeight('impact', impactRoots)) {
    if (placedImpacts.has(root.id)) continue;
    const position = place({ kind: 'impact', data: root }, 0, left);
    left = position.right + H_GAP * 2;
  }
  for (const root of byWeight('outcome', roots)) {
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
  const channels = []; // vertical runs cross-links have taken through intermediate rows
  for (const outcome of outcomes) {
    for (const project of projectsForOutcome(projects, outcome)) {
      if (String(primaryOutcomeOf.get(project.id)) === String(outcome.id)) continue;
      const from = outcomeNodeById.get(outcome.id);
      const to = projectNodeById.get(project.id);
      if (!from || !to) continue;
      edges.push({
        key: `${outcome.id}-project-${project.id}-cross`,
        d: crossLinkPath(from, to, nodes, channels),
        kind: 'project',
        ends: [`outcome-${outcome.id}`, `project-${project.id}`],
        from: { kind: 'outcome', id: outcome.id },
        to: { kind: 'project', id: project.id },
      });
    }
  }

  spreadLanes(edges);
  for (const edge of edges) edge.button = pathMidpoint(edge.d);

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

// The point halfway along a connector, where its remove button sits.
export function pathMidpoint(d) {
  const points = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MVH])([^MVH]*)/g)) {
    const values = args.trim().split(/\s+/).map(Number);
    if (cmd === 'M') [x, y] = values;
    else if (cmd === 'V') y = values[0];
    else x = values[0];
    points.push([x, y]);
  }
  const lengths = points.slice(1).map(([px, py], i) => Math.abs(px - points[i][0]) + Math.abs(py - points[i][1]));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
    }
    remaining -= lengths[i];
  }
  return { x, y };
}

// Connectors from different sources can jog sideways at the same (or nearly
// the same) height in a row gap, which draws them as one thick or doubled
// line. Each source's horizontal run is nudged into its own lane, a few
// pixels apart, wherever it overlaps another source's run. Runs from the same
// source stay together since they form a single bracket.
export const LANE_GAP = 6;
const MAX_LANES = 3; // either side of the run's natural height

export function spreadLanes(edges) {
  const bars = new Map();
  edges.forEach((edge) => {
    const group = edge.from ? `${edge.from.kind}-${edge.from.id}` : edge.key;
    const parts = [...edge.d.matchAll(/([MVH])([^MVH]*)/g)].map(([, cmd, args]) => [
      cmd,
      args.trim().split(/\s+/).map(Number),
    ]);
    let x = 0;
    let y = 0;
    parts.forEach(([cmd, args], index) => {
      if (cmd === 'M') [x, y] = args;
      else if (cmd === 'V') y = args[0];
      else {
        const key = `${group}@${y}`;
        if (!bars.has(key)) bars.set(key, { y, x1: Infinity, x2: -Infinity, refs: [] });
        const bar = bars.get(key);
        bar.x1 = Math.min(bar.x1, x, args[0]);
        bar.x2 = Math.max(bar.x2, x, args[0]);
        // The V before this run sets its height; moving that moves the run.
        if (index > 0 && parts[index - 1][0] === 'V') bar.refs.push(parts[index - 1][1]);
        x = args[0];
      }
    });
    edge.parts = parts;
  });

  const placed = [];
  for (const bar of bars.values()) {
    const neighbours = placed.filter((other) => other.x1 <= bar.x2 + LANE_GAP && bar.x1 <= other.x2 + LANE_GAP);
    let offset = 0;
    for (let lane = 1; lane <= MAX_LANES * 2; lane += 1) {
      if (neighbours.every((other) => Math.abs(other.y - (bar.y + offset)) >= LANE_GAP)) break;
      offset = Math.ceil(lane / 2) * LANE_GAP * (lane % 2 ? 1 : -1);
    }
    bar.y += offset;
    for (const ref of bar.refs) ref[0] = bar.y;
    placed.push(bar);
  }

  for (const edge of edges) {
    edge.d = edge.parts.map(([cmd, args]) => `${cmd}${args.join(' ')}`).join(' ');
    delete edge.parts;
  }
}

// Connector into a project two rows down: jogs sideways a quarter into the
// first gap, above the child outcomes' bracket so it never crosses their
// drops, runs down the trunk past the outcome row, then fans out in the gap
// above the projects as a bracket of its own.
function loweredPath(x1, y1, trunkX, x2, y2) {
  return `M${x1} ${y1} V${y1 + V_GAP / 4} H${trunkX} V${y2 - V_GAP / 2} H${x2} V${y2}`;
}

// A project cross-linked from an outcome it isn't primarily drawn under sits
// below that outcome, but a nested project's row is fixed by its parent
// project, so it can land in the same row as the outcome (or even a shallower
// one). The normal top-to-bottom elbow assumes the target is below the
// source, so on overlapping rows it would cut a line straight through the
// boxes in between. When rows overlap, dip under both boxes, clear of the
// insight pills hanging off their bottom edges, so the connector never
// crosses node interiors or badges.
// A cross-link can span several rows. Its sideways runs stay in the row gaps
// next to each end, and it passes the rows in between down a column clear of
// their nodes, so it never runs behind a box: straight down from the source if
// that column is clear, else straight down into the target, else through the
// nearest gap between nodes.
function crossLinkPath(from, to, nodes, channels) {
  const rowsOverlap = from.y < to.y + NODE_H && to.y < from.y + NODE_H;
  if (rowsOverlap) {
    const dipY = Math.max(from.y, to.y) + NODE_H + BADGE_REACH + LINE_CLEARANCE;
    return `M${from.x} ${from.y + NODE_H} V${dipY} H${to.x} V${to.y + NODE_H + 3}`;
  }
  const down = from.y < to.y;
  const between = nodes.filter((node) => (node.y - from.y) * (node.y - to.y) < 0);
  if (between.length === 0) {
    return down
      ? elbowPath(from.x, from.y + NODE_H, to.x, to.y - 3)
      : elbowPath(from.x, from.y - 3, to.x, to.y + NODE_H + 3);
  }

  const startY = down ? from.y + NODE_H : from.y - 3;
  const endY = down ? to.y - 3 : to.y + NODE_H + 3;
  const startGap = down ? from.y + NODE_H + V_GAP / 2 : from.y - V_GAP / 2;
  const endGap = down ? to.y - V_GAP / 2 : to.y + NODE_H + V_GAP / 2;
  const group = `outcome-${from.data.id}`;
  const [top, bottom] = [Math.min(startGap, endGap), Math.max(startGap, endGap)];

  const blocked = [];
  for (const node of [...between].sort((a, b) => a.x - b.x)) {
    const lo = node.x - NODE_W / 2 - CHANNEL_CLEARANCE;
    const hi = node.x + NODE_W / 2 + CHANNEL_CLEARANCE;
    const last = blocked[blocked.length - 1];
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else blocked.push([lo, hi]);
  }
  const clear = (x) =>
    blocked.every(([lo, hi]) => x < lo || x > hi) &&
    channels.every(
      (other) =>
        other.group === group || Math.abs(other.x - x) >= LANE_GAP || other.bottom < top || bottom < other.top
    );
  const take = (x) => {
    channels.push({ group, x, top, bottom });
    return x;
  };

  if (clear(from.x)) return `M${take(from.x)} ${startY} V${endGap} H${to.x} V${endY}`;
  if (clear(to.x)) return `M${from.x} ${startY} V${startGap} H${take(to.x)} V${endY}`;
  // The middle of each gap between the nodes in the way, or past either side
  // of them all, nudged a lane over if another source's run already took it.
  const bases = blocked.slice(1).map(([lo], i) => (blocked[i][1] + lo) / 2);
  bases.push(blocked[0][0] - LINE_CLEARANCE, blocked[blocked.length - 1][1] + LINE_CLEARANCE);
  const cost = (x) => Math.abs(x - from.x) + Math.abs(x - to.x);
  const channelX = take(
    bases
      .flatMap((x) => [x, x + LANE_GAP, x - LANE_GAP])
      .filter(clear)
      .sort((a, b) => cost(a) - cost(b))[0] ?? bases[bases.length - 1]
  );
  return `M${from.x} ${startY} V${startGap} H${channelX} V${endGap} H${to.x} V${endY}`;
}

// Whether wrapLabel had to cut the text short; only then does hovering a node
// reveal its whole name.
function isTruncated(lines) {
  return lines.at(-1)?.endsWith('…') ?? false;
}

// The name lines a node draws, as its own component wraps them.
function nodeLines(node, targets) {
  if (node.type === 'project') return wrapLabel(node.data.name, MAX_CHARS, MAX_LINES);
  const quantified =
    node.type === 'impact' ? targetsForImpact(targets, node.data) : targetsForOutcome(targets, node.data);
  return nodeLabel(node.data.name, quantified).lines;
}

// Where each line of a node's whole name goes, and how tall its overlay is. The
// lines keep the node's spacing, so the first ones sit exactly where the node
// draws them, and the overlay grows down to hold the rest. Lines level with
// the insight pill flow around it: they are shorter and start past its right
// end. Impacts have no pill.
function fullNameLayout({ type, data, x, y, dollars }) {
  const hasPill = type !== 'impact';
  const slotY = (index) => y + NODE_H / 2 - (hasPill ? LABEL_LIFT : 0) - ((MAX_LINES - 1) * LINE_H) / 2 + index * LINE_H;
  const besidePill = (index) => hasPill && Math.abs(slotY(index) - (y + NODE_H)) < PILL_BAND;
  const left = pillReach(dollars) + TEXT_INSET;
  const narrowChars = Math.floor((NODE_W - TEXT_INSET - left) / CHAR_W);
  const lines = wrapToBudgets(data.name, (index) => (besidePill(index) ? narrowChars : MAX_CHARS));
  const placed = lines.map((line, index) => ({
    line,
    x: besidePill(index) ? x - NODE_W / 2 + (left + NODE_W - TEXT_INSET) / 2 : x,
    y: slotY(index),
  }));
  const height = Math.max(NODE_H, placed.at(-1).y + LINE_H - y);
  return { placed, height };
}

// Greedy word wrap where each line can have its own character budget. A word
// too long for a shortened line leaves that line empty and moves on; only a
// word longer than a full line is hard-broken.
function wrapToBudgets(text, budgetAt) {
  const lines = [];
  let line = '';
  for (let word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    while (word) {
      const budget = budgetAt(lines.length);
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= budget) {
        line = candidate;
        word = '';
      } else if (line) {
        lines.push(line);
        line = '';
      } else if (budget < MAX_CHARS) {
        lines.push('');
      } else {
        lines.push(word.slice(0, budget));
        word = word.slice(budget);
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

// A truncated node's whole name, laid over the node in its own colors and
// growing downward as far as the name needs. It is drawn inside the node, so
// hovering any of it keeps the node hovered and clicking it edits the node. The
// badges, the add button and the insight pill stay put and sit above it.
function FullName({ node }) {
  const { type, data, x, y } = node;
  const { placed, height } = fullNameLayout(node);
  const className = [
    'tree-node tree-node-full',
    type !== 'outcome' && type,
    type === 'outcome' && data.parent_outcome_id == null && 'root',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <g className={className} aria-hidden="true">
      <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={height} rx="10" />
      <text textAnchor="middle" dominantBaseline="middle">
        {placed.map(
          (item, index) =>
            item.line && (
              <tspan key={index} x={item.x} y={item.y}>
                {item.line}
              </tspan>
            )
        )}
      </text>
    </g>
  );
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
