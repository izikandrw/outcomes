import { insightsForProject, outcomesForProject, teamsOnProject, totalDollarImpact } from '../lib/links.js';
import InsightBadge from './InsightBadge.jsx';
import TeamChips from './TeamChips.jsx';

// Projects are the outputs, so the roadmap sequences them by start date (end
// date when there is no start), grouped by the month they begin. Projects with
// neither date can't be placed in time; they sit at the end rather than
// disappearing, since an unscheduled output is worth noticing.
const anchor = (project) => project.start_at || project.end_at;
export default function Roadmap({ projects, outcomes, teams, insights, suggestions, onEditProject, onShowInsights, onOpenTeam, emptyMessage }) {
  const scheduled = projects
    .filter(anchor)
    .sort((a, b) => new Date(anchor(a)) - new Date(anchor(b)) || a.id - b.id);
  const unscheduled = projects.filter((project) => !anchor(project));

  const months = [];
  for (const project of scheduled) {
    const key = monthKey(anchor(project));
    const last = months[months.length - 1];
    if (last?.key === key) last.projects.push(project);
    else months.push({ key, projects: [project] });
  }

  if (projects.length === 0) {
    return (
      <p className="empty">
        {emptyMessage ?? 'No projects yet. Add one from an outcome to see it on the roadmap.'}
      </p>
    );
  }

  const renderProject = (project) => {
    const driven = outcomesForProject(outcomes, project);
    return (
      <li key={project.id} className="roadmap-item">
        {anchor(project) && <span className="roadmap-date">{formatRange(project)}</span>}
        <div className="roadmap-body">
          <button type="button" className="link-button" onClick={() => onEditProject(project)}>
            {project.name}
          </button>
          <p className="meta">
            <TeamChips entries={teamsOnProject(projects, project)} teams={teams} onOpen={onOpenTeam} />
            <InsightBadge
              count={insightsForProject(insights, project).length}
              suggested={insightsForProject(suggestions, project).length}
              dollars={totalDollarImpact(insightsForProject(insights, project))}
              label={project.name}
              onClick={(filter) => onShowInsights(project, 'project', filter)}
            />
            {driven.length === 0 ? (
              <span className="tag warn">No outcome</span>
            ) : (
              driven.map((outcome) => (
                <span className="tag parent" key={outcome.id}>
                  {outcome.name}
                </span>
              ))
            )}
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="roadmap">
      {months.map(({ key, projects: inMonth }) => (
        <section key={key} className="roadmap-group" aria-label={monthLabel(key)}>
          <h2>{monthLabel(key)}</h2>
          <ul>{inMonth.map(renderProject)}</ul>
        </section>
      ))}
      {unscheduled.length > 0 && (
        <section className="roadmap-group roadmap-unscheduled" aria-label="Unscheduled">
          <h2>Unscheduled</h2>
          <ul>{unscheduled.map(renderProject)}</ul>
        </section>
      )}
    </div>
  );
}

// Due dates come from a date input as UTC midnight, so month and day are read
// in UTC to avoid sliding a day back for anyone west of it.
const monthKey = (value) => new Date(value).toISOString().slice(0, 7);

function monthLabel(key) {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatRange({ start_at, end_at }) {
  if (start_at && end_at) return `${formatDay(start_at)} – ${formatDay(end_at)}`;
  if (start_at) return `from ${formatDay(start_at)}`;
  return `by ${formatDay(end_at)}`;
}

function formatDay(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
