const MAX_SHOWN = 3;
const R = 9;

// Straddles the node's top edge, top-right, mirroring the issue badges on the
// left. Solid = a team working on this directly, dashed = a team working on
// something beneath it; clicking one opens that team's home page. Past MAX_SHOWN the rest collapse into a count.
export default function TeamBadges({ x, y, width, entries, teams, idPrefix, onOpen }) {
  if (entries.length === 0) return null;
  const shown = entries.length > MAX_SHOWN ? entries.slice(0, MAX_SHOWN - 1) : entries;
  const hidden = entries.slice(shown.length);
  const nameOf = (id) => teams.find((team) => String(team.id) === String(id))?.name ?? `team ${id}`;

  return (
    <>
      {shown.map(({ teamId, direct }, index) => {
        const team = teams.find((item) => String(item.id) === String(teamId));
        const cx = x + width / 2 - 12 - index * 21;
        const clipId = `${idPrefix}-team-${teamId}`;
        return (
          <g
            key={teamId}
            className={['node-team', direct ? 'direct' : 'indirect'].join(' ')}
            role="button"
            tabIndex={0}
            aria-label={`Open ${nameOf(teamId)}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen?.(teamId);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onOpen?.(teamId);
              }
            }}
          >
            <title>{direct ? `${nameOf(teamId)} — working on this directly` : `${nameOf(teamId)} — working on something beneath this`}</title>
            <circle cx={cx} cy={y} r={R + 2} />
            {team?.logo ? (
              <>
                <clipPath id={clipId}>
                  <circle cx={cx} cy={y} r={R} />
                </clipPath>
                <image href={team.logo} x={cx - R} y={y - R} width={R * 2} height={R * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
              </>
            ) : (
              <text x={cx} y={y} textAnchor="middle" dominantBaseline="central">
                {nameOf(teamId).trim().charAt(0).toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
      {hidden.length > 0 && (
        <g className="node-team indirect more" role="img" aria-label={hidden.map(({ teamId }) => nameOf(teamId)).join(', ')}>
          <title>{hidden.map(({ teamId }) => nameOf(teamId)).join(', ')}</title>
          <circle cx={x + width / 2 - 12 - shown.length * 21} cy={y} r={R + 2} />
          <text x={x + width / 2 - 12 - shown.length * 21} y={y} textAnchor="middle" dominantBaseline="central">
            +{hidden.length}
          </text>
        </g>
      )}
    </>
  );
}
