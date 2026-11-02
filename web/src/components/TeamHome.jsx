import { rollupForProjects, teamIdsWithin } from '../lib/links.js';
import Roadmap from './Roadmap.jsx';

// A team's home page: the projects it is running, sequenced as a roadmap, and
// how those projects roll up through outcomes to the business impact. Teams
// nest, so by default the page also covers the teams beneath this one — the
// same roll-up a parent team's outcomes already get.
export default function TeamHome({
  team,
  teams,
  projects,
  outcomes,
  impacts,
  insights,
  suggestions,
  onBack,
  onEdit,
  onOpenTeam,
  onOpenProject,
  onUpdateProject,
  onToggleProjectOutcome,
  onDeleteProject,
  onOpenOutcome,
  onOpenImpact,
  onShowInsights,
  includeSubteams,
  onIncludeSubteamsChange: setIncludeSubteams,
}) {
  const parent = teams.find((item) => String(item.id) === String(team.parent_team_id));
  const children = teams.filter((item) => String(item.parent_team_id) === String(team.id));

  const scope = includeSubteams ? teamIdsWithin(teams, team) : new Set([String(team.id)]);
  const teamProjects = projects.filter((project) => scope.has(String(project.team_id)));
  const accountable = outcomes.filter((outcome) => scope.has(String(outcome.team_id)));
  const rollup = rollupForProjects(teamProjects, outcomes, impacts);
  const hasRollup = rollup.roots.length + rollup.noImpact.length + rollup.unlinkedProjects.length > 0;

  const handlers = { project: onOpenProject, outcome: onOpenOutcome, impact: onOpenImpact };

  return (
    <div className="team-home">
      <div className="team-home-nav">
        <button type="button" className="ghost small" onClick={onBack}>
          ← Teams
        </button>
        <button type="button" className="ghost small" onClick={() => onEdit(team)}>
          Edit team
        </button>
      </div>

      <header className="team-home-head">
        {team.logo ? (
          <img className="logo-preview" src={team.logo} alt="" />
        ) : (
          <span className="logo-preview team-initial-badge">{team.name.trim().charAt(0).toUpperCase() || '?'}</span>
        )}
        <div>
          <h2>{team.name}</h2>
          <p className="meta">
            {parent && (
              <span>
                Part of{' '}
                <button type="button" className="link-button" onClick={() => onOpenTeam(parent.id)}>
                  {parent.name}
                </button>
              </span>
            )}
            {children.map((child) => (
              <button key={child.id} type="button" className="team-chip indirect link" onClick={() => onOpenTeam(child.id)}>
                {child.name}
              </button>
            ))}
          </p>
          <p className="meta">
            <span>
              {teamProjects.length} project{teamProjects.length === 1 ? '' : 's'}
            </span>
            <span>
              accountable for {accountable.length} outcome{accountable.length === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        {children.length > 0 && (
          <label className="team-home-toggle">
            <input
              type="checkbox"
              checked={includeSubteams}
              onChange={(event) => setIncludeSubteams(event.target.checked)}
            />
            Include sub-teams
          </label>
        )}
      </header>

      <section aria-label="Roadmap">
        <h3>Roadmap</h3>
        <Roadmap
          projects={teamProjects}
          allProjects={projects}
          outcomes={outcomes}
          teams={teams}
          insights={insights}
          suggestions={suggestions}
          onUpdateProject={onUpdateProject}
          onToggleProjectOutcome={onToggleProjectOutcome}
          onDeleteProject={onDeleteProject}
          onShowInsights={onShowInsights}
          onOpenTeam={onOpenTeam}
          emptyMessage="This team isn't running any projects yet."
        />
      </section>

      <section aria-label="Roll-up">
        <h3>How this rolls up</h3>
        {!hasRollup ? (
          <p className="empty">Nothing to roll up until the team has a project.</p>
        ) : (
          <ul className="rollup">
            {rollup.roots.map((node) => (
              <RollupNode key={`impact-${node.data.id}`} node={node} handlers={handlers} teamId={team.id} teams={teams} />
            ))}
            {rollup.noImpact.length > 0 && (
              <li>
                <span className="rollup-note">Outcomes with no impact linked</span>
                <ul>
                  {rollup.noImpact.map((node) => (
                    <RollupNode key={`outcome-${node.data.id}`} node={node} handlers={handlers} teamId={team.id} teams={teams} />
                  ))}
                </ul>
              </li>
            )}
            {rollup.unlinkedProjects.length > 0 && (
              <li>
                <span className="rollup-note warn">Projects driving no outcome</span>
                <ul>
                  {rollup.unlinkedProjects.map((project) => (
                    <RollupNode
                      key={`project-${project.id}`}
                      node={{ kind: 'project', data: project, children: [] }}
                      handlers={handlers}
                      teamId={team.id}
                      teams={teams}
                    />
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function RollupNode({ node, handlers, teamId, teams }) {
  const { kind, data, children } = node;
  // A project from a sub-team says whose it is, since the page covers several.
  const owner =
    kind === 'project' && String(data.team_id) !== String(teamId)
      ? teams.find((team) => String(team.id) === String(data.team_id))?.name
      : null;
  return (
    <li>
      <button type="button" className={`rollup-pill ${kind}`} onClick={() => handlers[kind](data)}>
        <span className="rollup-kind">{kind}</span>
        {data.name}
        {owner && <span className="rollup-owner">· {owner}</span>}
      </button>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <RollupNode key={`${child.kind}-${child.data.id}`} node={child} handlers={handlers} teamId={teamId} teams={teams} />
          ))}
        </ul>
      )}
    </li>
  );
}
