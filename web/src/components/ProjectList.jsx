import { useMemo, useRef, useState } from 'react';
import { insightsForProject, outcomesForProject, teamsOnProject, totalDollarImpact } from '../lib/links.js';
import { matchesFilters } from '../lib/insightFilters.js';
import { projectFilterFields } from '../lib/projectFilters.js';
import useSlashFocus from '../lib/useSlashFocus.js';
import useStuck from '../lib/useStuck.js';
import FilterBar from './FilterBar.jsx';
import InsightBadge from './InsightBadge.jsx';
import { InlineText, LinkPicker, PillField, PillSelect } from './InlineFields.jsx';
import TeamChips from './TeamChips.jsx';
import { PlusIcon, SearchIcon, TrashIcon } from './icons.jsx';

// Flat list of every project, laid out like the outcome and impact lists. The
// roadmap places projects in time; this is where to find one and narrow them
// down by team, schedule, evidence and what they drive, using the fields in
// projectFilters.js. Every field on a row edits in place, as on an insight
// card: onUpdate(project, patch) saves a change to its own fields and
// onToggleOutcome(project, outcome) links or unlinks an outcome it drives.
export default function ProjectList({
  view,
  onViewChange,
  projects,
  allProjects = projects,
  outcomes,
  teams,
  impacts = [],
  insights,
  suggestions,
  issues,
  onCreate,
  onUpdate,
  onToggleOutcome,
  onDelete,
  onShowInsights,
  onOpenTeam,
}) {
  // The search and filters ({ q, filters }), which the app keeps in the URL.
  const { q: query, filters } = view;
  const setQuery = (q) => onViewChange({ ...view, q });
  const setFilters = (next) => onViewChange({ ...view, filters: next });
  const toolbarRef = useRef(null);
  const stuck = useStuck(toolbarRef);
  const searchRef = useRef(null);
  useSlashFocus(searchRef);

  const fields = useMemo(
    () => projectFilterFields({ projects: allProjects, outcomes, teams, impacts, insights, suggestions, issues }),
    [allProjects, outcomes, teams, impacts, insights, suggestions, issues],
  );

  const needle = query.trim().toLowerCase();
  const searched = needle
    ? projects.filter((project) =>
        `${project.name} ${project.description ?? ''} #${project.id}`.toLowerCase().includes(needle),
      )
    : projects;
  const visible = searched.filter((project) => matchesFilters(project, fields, filters));

  // How many projects an option would show, given the search and the other fields' filters.
  function countFor(fieldId, optionId) {
    const field = fields.find((entry) => entry.id === fieldId);
    return searched.filter(
      (project) => field.values(project).includes(optionId) && matchesFilters(project, fields, filters, fieldId),
    ).length;
  }

  const filtered = needle || Object.keys(filters).length > 0;

  return (
    <>
      <div ref={toolbarRef} className={`list-toolbar${stuck ? ' stuck' : ''}`}>
        <div className="list-toolbar-row">
          <label className="search-box">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label="Search projects"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {/* The count and Clear hang off the right of New project, as on the outcome list. */}
          <span className="list-toolbar-end">
            <button type="button" className="with-icon btn-project" onClick={onCreate}>
              <PlusIcon />
              New project
            </button>
            <span className="list-toolbar-status">
              {filtered && <span className="id list-toolbar-count">{`${visible.length} of ${projects.length}`}</span>}
              {Object.keys(filters).length > 0 && (
                <button type="button" className="filter-clear" onClick={() => setFilters({})}>
                  Clear
                </button>
              )}
            </span>
          </span>
        </div>
        <FilterBar fields={fields} filters={filters} onChange={setFilters} countFor={countFor} showClear={false} />
      </div>
      {visible.length === 0 ? (
        <p className="empty">No projects match.</p>
      ) : (
        <ul className="outcome-list">
          {visible.map((project) => (
            <li key={project.id}>
              <ProjectRow
                project={project}
                allProjects={allProjects}
                outcomes={outcomes}
                teams={teams}
                insights={insights}
                suggestions={suggestions}
                onUpdate={onUpdate}
                onToggleOutcome={onToggleOutcome}
                onDelete={onDelete}
                onShowInsights={onShowInsights}
                onOpenTeam={onOpenTeam}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const dateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const sameId = (a, b) => String(a) === String(b);

// Every project nested beneath `project`, however deep; none of them can be its parent.
function descendantIds(projects, project) {
  const found = new Set();
  const queue = [project.id];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const item of projects) {
      if (sameId(item.parent_project_id, id) && !found.has(String(item.id))) {
        found.add(String(item.id));
        queue.push(item.id);
      }
    }
  }
  return found;
}

// One project, every field a click away from editing: name and description as
// text, team and parent as tag-like selects, dates as date pickers, and the
// outcomes it drives as a checklist. A failed save shows under the row.
function ProjectRow({
  project,
  allProjects,
  outcomes,
  teams,
  insights,
  suggestions,
  onUpdate,
  onToggleOutcome,
  onDelete,
  onShowInsights,
  onOpenTeam,
}) {
  const [error, setError] = useState(null);

  async function run(action) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  }
  const save = (patch) => run(() => onUpdate(project, patch));

  function saveDate(field, value) {
    const next = { start_at: dateInput(project.start_at), end_at: dateInput(project.end_at), [field]: value };
    if (next.start_at && next.end_at && next.end_at < next.start_at) {
      setError('The end date cannot be before the start date.');
      return;
    }
    save({ [field]: value ? new Date(value).toISOString() : null });
  }

  const driven = outcomesForProject(outcomes, project);
  const projectInsights = insightsForProject(insights, project);
  // The project's own team is the select; chips are only for teams on projects nested under it.
  const nestedTeams = teamsOnProject(allProjects, project).filter((entry) => !entry.direct);
  const outcomeItems = outcomes.map((outcome) => ({
    kind: 'outcome',
    id: Number(outcome.id),
    name: outcome.name,
    group: 'Outcomes',
    linked: driven.some((item) => sameId(item.id, outcome.id)),
    outcome,
  }));
  const nested = descendantIds(allProjects, project);
  const parentOptions = allProjects
    .filter((item) => !sameId(item.id, project.id) && !nested.has(String(item.id)))
    .map((item) => ({ id: String(item.id), label: item.name }));

  return (
    <div className="outcome project-row">
      <div>
        <h3>
          <InlineText value={project.name} label="Project name" required onCommit={(name) => save({ name })} />
        </h3>
        <p className="description">
          <InlineText
            value={project.description ?? ''}
            label="Description"
            placeholder="Add a description"
            multiline
            onCommit={(description) => save({ description: description || null })}
          />
        </p>
        <div className="meta">
          <PillField label="Drives" title="The outcomes this project moves">
            <LinkPicker
              items={outcomeItems}
              label="Drives outcomes"
              buttonClassName={`tag link-pill${driven.length === 0 ? ' warn' : ''}`}
              onToggle={(item) => run(() => onToggleOutcome(project, item.outcome))}
            >
              {driven.length === 0
                ? 'No outcome'
                : driven.length <= 2
                  ? driven.map((outcome) => outcome.name).join(', ')
                  : `${driven.length} outcomes`}
            </LinkPicker>
          </PillField>
          <PillField label="Team" title="The team running this project">
            <PillSelect
              label="Team"
              value={project.team_id ? String(project.team_id) : ''}
              options={teams.map((team) => ({ id: String(team.id), label: team.name }))}
              empty="No team"
              onChange={(value) => save({ team_id: value ? Number(value) : null })}
            />
          </PillField>
          <TeamChips entries={nestedTeams} teams={teams} onOpen={onOpenTeam} />
          <PillField label="Start" title="When work starts; places it on the roadmap">
            <input
              className="cell-input pill-date"
              type="date"
              aria-label="Start date"
              value={dateInput(project.start_at)}
              onChange={(event) => saveDate('start_at', event.target.value)}
            />
          </PillField>
          <PillField label="End" title="When it is due to ship">
            <input
              className="cell-input pill-date"
              type="date"
              aria-label="End date"
              value={dateInput(project.end_at)}
              onChange={(event) => saveDate('end_at', event.target.value)}
            />
          </PillField>
          <PillField label="Parent" title="The project this is nested under">
            <PillSelect
              label="Parent project"
              value={project.parent_project_id ? String(project.parent_project_id) : ''}
              options={parentOptions}
              empty="None"
              onChange={(value) => save({ parent_project_id: value ? Number(value) : null })}
            />
          </PillField>
          <InsightBadge
            count={projectInsights.length}
            suggested={insightsForProject(suggestions, project).length}
            dollars={totalDollarImpact(projectInsights)}
            label={project.name}
            onClick={(filter) => onShowInsights(project, 'project', filter)}
          />
          <span className="id">#{project.id}</span>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="actions">
        <button
          type="button"
          className="icon-button danger"
          aria-label={`Delete ${project.name}`}
          title="Delete"
          onClick={() => onDelete(project)}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
