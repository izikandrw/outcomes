import { useMemo, useRef } from 'react';
import { insightsForProject, outcomesForProject, teamsOnProject, totalDollarImpact } from '../lib/links.js';
import { matchesFilters } from '../lib/insightFilters.js';
import { projectFilterFields } from '../lib/projectFilters.js';
import useSlashFocus from '../lib/useSlashFocus.js';
import useStuck from '../lib/useStuck.js';
import FilterBar from './FilterBar.jsx';
import InsightBadge from './InsightBadge.jsx';
import { formatRange } from './Roadmap.jsx';
import TeamChips from './TeamChips.jsx';
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon } from './icons.jsx';

// Flat list of every project, laid out like the outcome and impact lists. The
// roadmap places projects in time; this is where to find one and narrow them
// down by team, schedule, evidence and what they drive, using the fields in
// projectFilters.js.
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
  onEdit,
  onDelete,
  onShowInsights,
  onOpenTeam,
}) {
  const nameOf = (id) => allProjects.find((item) => String(item.id) === String(id))?.name ?? null;
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
          {visible.map((project) => {
            const driven = outcomesForProject(outcomes, project);
            const projectInsights = insightsForProject(insights, project);
            return (
              <li key={project.id}>
                <div className="outcome">
                  <div>
                    <h3>{project.name}</h3>
                    {project.description && <p className="description">{project.description}</p>}
                    <p className="meta">
                      {(project.start_at || project.end_at) && (
                        <span className="id">{formatRange(project)}</span>
                      )}
                      <TeamChips entries={teamsOnProject(allProjects, project)} teams={teams} onOpen={onOpenTeam} />
                      <InsightBadge
                        count={projectInsights.length}
                        suggested={insightsForProject(suggestions, project).length}
                        dollars={totalDollarImpact(projectInsights)}
                        label={project.name}
                        onClick={(filter) => onShowInsights(project, 'project', filter)}
                      />
                      {driven.length === 0 ? (
                        <span className="tag warn">No outcome</span>
                      ) : (
                        driven.map((outcome) => (
                          <span className="tag" key={outcome.id}>
                            {outcome.name}
                          </span>
                        ))
                      )}
                      {project.parent_project_id && nameOf(project.parent_project_id) && (
                        <span className="tag parent">↳ {nameOf(project.parent_project_id)}</span>
                      )}
                      <span className="id">#{project.id}</span>
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${project.name}`}
                      title="Edit"
                      onClick={() => onEdit(project)}
                    >
                      <PencilIcon />
                    </button>
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
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
