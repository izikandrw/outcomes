import { useLayoutEffect, useRef } from 'react';
import { roadmapMonths } from '../lib/roadmapMonths.js';
import ProjectRow from './ProjectRow.jsx';

// Projects are the outputs, so the roadmap shows what each month holds: the work
// in progress and the work completing in it (see roadmapMonths). A project running
// November to February is in progress under November, December and January, and
// completed under February. Projects with neither date can't be placed in time;
// they sit at the end rather than disappearing, since an unscheduled output is
// worth noticing. Every project edits in place, so setting a date here moves it to
// where it now belongs. `projects` is what to show; `allProjects` is who else it
// can nest under.
const isScheduled = (project) => project.start_at || project.end_at;
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
  const months = roadmapMonths(projects);
  const unscheduled = projects.filter((project) => !isScheduled(project));

  if (projects.length === 0) {
    return (
      <p className="empty">
        {emptyMessage ?? 'No projects yet. Add one from an outcome to see it on the roadmap.'}
      </p>
    );
  }

  const renderProject = (project) => (
    <li key={project.id} className="roadmap-item" data-project-id={project.id}>
      {isScheduled(project) && <span className="roadmap-date">{formatRange(project)}</span>}
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
      {months.length === 0 && (
        <p className="empty">
          No scheduled projects. Set a start or end date on a project below to place it on the roadmap.
        </p>
      )}
      {months.map(({ key, inProgress, completed }) => (
        <section key={key} className="roadmap-group" aria-label={monthLabel(key)} data-month={key}>
          <h2>{monthLabel(key)}</h2>
          {inProgress.length > 0 && (
            <section className="roadmap-status" aria-label={`In progress, ${monthLabel(key)}`}>
              <h3>In progress</h3>
              <ul>{inProgress.map(renderProject)}</ul>
            </section>
          )}
          {completed.length > 0 && (
            <section className="roadmap-status" aria-label={`Completed, ${monthLabel(key)}`}>
              <h3>Completed</h3>
              <ul>{completed.map(renderProject)}</ul>
            </section>
          )}
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

// A date change can move a row to another month or subsection, which remounts it
// and drops the focus. This puts the focus back on the same field of the same
// project and brings it into view, so the next field is still a Tab away. A project
// can be listed in several months, so it prefers the row in the month being edited.
// Focus is read during render because by the time an effect runs the old element is
// already gone.
function useFollowFocus(projects) {
  const root = useRef(null);
  const before = useRef(null);

  const active = document.activeElement;
  const row = active?.closest('[data-project-id]');
  const label = active?.getAttribute('aria-label');
  before.current =
    row && label && root.current?.contains(row)
      ? { id: row.dataset.projectId, label, month: row.closest('[data-month]')?.dataset.month }
      : null;

  useLayoutEffect(() => {
    if (!before.current || (document.activeElement && document.activeElement !== document.body)) return;
    const { id, label: field, month } = before.current;
    const selector = `[data-project-id="${CSS.escape(id)}"] [aria-label="${CSS.escape(field)}"]`;
    const target =
      (month && root.current?.querySelector(`[data-month="${CSS.escape(month)}"] ${selector}`)) ||
      root.current?.querySelector(selector);
    target?.focus();
    target?.scrollIntoView({ block: 'center' });
  }, [projects]);

  return root;
}

// Due dates come from a date input as UTC midnight, so month and day are read
// in UTC to avoid sliding a day back for anyone west of it.
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
