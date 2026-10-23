// Teams working on an outcome or project, for list and roadmap cards. A solid
// chip is a team working on it directly; a dashed one is working on something
// beneath it. `entries` comes from teamsOnOutcome / teamsOnProject. Passing
// `onOpen` makes each chip a link to that team's home page.
export default function TeamChips({ entries, teams, onOpen }) {
  return entries.map(({ teamId, direct }) => {
    const name = teams.find((team) => String(team.id) === String(teamId))?.name ?? `team ${teamId}`;
    const className = ['team-chip', direct ? 'direct' : 'indirect', onOpen && 'link'].filter(Boolean).join(' ');
    const title = direct ? `${name} — working on this directly` : `${name} — working on something beneath this`;
    return onOpen ? (
      <button key={teamId} type="button" className={className} title={title} onClick={() => onOpen(teamId)}>
        {name}
      </button>
    ) : (
      <span key={teamId} className={className} title={title}>
        {name}
      </span>
    );
  });
}
