import { useLayoutEffect, useRef } from 'react';
import ProjectRow from './ProjectRow.jsx';

// Projects are the outputs, so the roadmap sequences them by start date (end
// date when there is no start), grouped by the month they begin. Projects with
// neither date can't be placed in time; they sit at the end rather than
// disappearing, since an unscheduled output is worth noticing. Every project
// edits in place, so setting a date here moves it to where it now belongs.
// `projects` is what to show; `allProjects` is who else it can nest under.
const anchor = (project) => project.start_at || project.end_at;
export default function Roadmap({
  projects,
  allProjects = projects,
  outcomes,
  teams,
  insights,
  suggestions,
  onUpdateProject,
  onToggleProjectOutcome,
  onDeleteProject,
  onShowInsights,
  onOpenTeam,
  emptyMessage,
}) {
  const followFocus = useFollowFocus(projects);
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

  const renderProject = (project) => (
    <li key={project.id} className="roadmap-item" data-project-id={project.id}>
      {anchor(project) && <span className="roadmap-date">{formatRange(project)}</span>}
      <div className="roadmap-body">
        <ProjectRow
          project={project}
          allProjects={allProjects}
          outcomes={outcomes}
          teams={teams}
          insights={insights}
          suggestions={suggestions}
          onUpdate={onUpdateProject}
          onToggleOutcome={onToggleProjectOutcome}
          onDelete={onDeleteProject}
          onShowInsights={onShowInsights}
          onOpenTeam={onOpenTeam}
        />
      </div>
    </li>
  );

  return (
    <div className="roadmap" ref={followFocus}>
      {scheduled.length === 0 && (
        <p className="empty">
          No scheduled projects. Set a start or end date on a project below to place it on the roadmap.
        </p>
      )}
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

// A date change can move a row to another month, which remounts it and drops the
// focus. This puts the focus back on the same field of the same project and brings
// it into view, so the next field is still a Tab away. Focus is read during render
// because by the time an effect runs the old element is already gone.
function useFollowFocus(projects) {
  const root = useRef(null);
  const before = useRef(null);

  const active = document.activeElement;
  const row = active?.closest('[data-project-id]');
  const label = active?.getAttribute('aria-label');
  before.current = row && label && root.current?.contains(row) ? { id: row.dataset.projectId, label } : null;

  useLayoutEffect(() => {
    if (!before.current || (document.activeElement && document.activeElement !== document.body)) return;
    const { id, label: field } = before.current;
    const target = root.current?.querySelector(
      `[data-project-id="${CSS.escape(id)}"] [aria-label="${CSS.escape(field)}"]`,
    );
    target?.focus();
    target?.scrollIntoView({ block: 'center' });
  }, [projects]);

  return root;
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
