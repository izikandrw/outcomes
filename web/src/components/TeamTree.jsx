import {
  NODE_H,
  H_GAP,
  LEVEL_H,
  PAD,
  LINE_H,
  elbowPath,
  wrapLabel,
} from './OutcomeTree.jsx';
import { PlusIcon } from './icons.jsx';

// Space reserved for a team's logo at the left of its node.
const LOGO_BOX = 32;
const LOGO_INSET = 12;
// Wider than the outcome nodes so the counts line fits beside the logo.
const NODE_W = 224;
const NAME_CHARS = 20;

// Team hierarchy drawn like the outcome map: parents above, children below,
// each parent centred over its children. Hover "+" adds a team beneath one.
export default function TeamTree({ teams, outcomes, projects, onCreate, onEdit, onAddChild }) {
  const { nodes, edges, width, height } = layout(teams);
  const countFor = (collection, team) => collection.filter((item) => item.team_id === team.id).length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <>
      <div className="list-head">
        <span className="id">{plural(teams.length, 'team')}</span>
        <button type="button" className="with-icon" onClick={onCreate}>
          <PlusIcon />
          New team
        </button>
      </div>
      <div className="tree-scroll">
        <svg className="tree" width={width} height={height} role="tree" aria-label="Team hierarchy">
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
            <path key={edge.key} className="tree-edge" d={edge.d} fill="none" markerEnd="url(#tree-arrow)" />
          ))}

          {nodes.map(({ team, x, y, depth }) => {
            const lines = wrapLabel(team.name, NAME_CHARS, 2);
            const textX = x - NODE_W / 2 + LOGO_INSET + LOGO_BOX + 10;
            const counts = `${plural(countFor(outcomes, team), 'outcome')} · ${plural(countFor(projects, team), 'project')}`;
            const all = [...lines, counts];
            const open = () => onEdit(team);
            return (
              <g
                key={team.id}
                className={['tree-node', depth === 0 && 'root'].filter(Boolean).join(' ')}
                role="treeitem"
                aria-level={depth + 1}
                tabIndex={0}
                onClick={open}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                  }
                }}
              >
                <title>{`${team.name}\n${counts}`}</title>
                <rect x={x - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="10" />
                {team.logo ? (
                  <image
                    href={team.logo}
                    x={x - NODE_W / 2 + LOGO_INSET}
                    y={y + (NODE_H - LOGO_BOX) / 2}
                    width={LOGO_BOX}
                    height={LOGO_BOX}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : (
                  <g className="team-initial">
                    <circle cx={x - NODE_W / 2 + LOGO_INSET + LOGO_BOX / 2} cy={y + NODE_H / 2} r={LOGO_BOX / 2} />
                    <text x={x - NODE_W / 2 + LOGO_INSET + LOGO_BOX / 2} y={y + NODE_H / 2} textAnchor="middle" dominantBaseline="central">
                      {team.name.trim().charAt(0).toUpperCase()}
                    </text>
                  </g>
                )}
                <text x={textX} y={y + NODE_H / 2} textAnchor="start" dominantBaseline="middle">
                  {all.map((line, index) => (
                    <tspan
                      key={index}
                      className={index === all.length - 1 ? 'tree-node-team' : undefined}
                      x={textX}
                      dy={index === 0 ? -((all.length - 1) * LINE_H) / 2 : LINE_H}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>

                <g
                  className="node-add"
                  role="button"
                  tabIndex={0}
                  aria-label={`Add team under ${team.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddChild(team);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onAddChild(team);
                    }
                  }}
                >
                  <circle cx={x + NODE_W / 2} cy={y + NODE_H / 2} r="11" />
                  <path
                    d={`M${x + NODE_W / 2 - 5} ${y + NODE_H / 2}h10M${x + NODE_W / 2} ${y + NODE_H / 2 - 5}v10`}
                  />
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}

function layout(teams) {
  const present = new Set(teams.map((team) => team.id));
  const byParent = new Map();
  for (const team of teams) {
    // A parent that isn't in the set is drawn as a root rather than dropped.
    const key = team.parent_team_id != null && present.has(team.parent_team_id) ? team.parent_team_id : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(team);
  }

  const nodes = [];
  const edges = [];
  const placed = new Set();
  let maxDepth = 0;

  function place(team, depth, left) {
    maxDepth = Math.max(maxDepth, depth);
    placed.add(team.id);
    const y = PAD + depth * LEVEL_H;
    const children = (byParent.get(team.id) ?? []).filter((child) => !placed.has(child.id));

    let x;
    let right;
    const positions = [];
    if (children.length === 0) {
      x = left + NODE_W / 2;
      right = left + NODE_W;
    } else {
      let childLeft = left;
      for (const child of children) {
        const position = place(child, depth + 1, childLeft);
        positions.push({ ...position, id: child.id });
        childLeft = position.right + H_GAP;
      }
      right = childLeft - H_GAP;
      x = (positions[0].x + positions[positions.length - 1].x) / 2;
    }

    nodes.push({ team, x, y, depth });
    for (const child of positions) {
      edges.push({ key: `${team.id}-${child.id}`, d: elbowPath(x, y + NODE_H, child.x, child.y - 3) });
    }
    return { x, y, right };
  }

  let left = PAD;
  for (const root of byParent.get(null) ?? []) {
    if (placed.has(root.id)) continue;
    left = place(root, 0, left).right + H_GAP * 2;
  }

  return {
    nodes,
    edges,
    width: Math.max(left - H_GAP * 2 + PAD, NODE_W + PAD * 2),
    height: PAD * 2 + maxDepth * LEVEL_H + NODE_H,
  };
}
