import { useEffect, useState } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TargetsSection from './TargetsSection.jsx';
import { projectsForOutcome } from '../lib/links.js';

const EMPTY = {
  name: '',
  description: '',
  team_id: '',
  impact_id: '',
};

// Rendered inside the modal, which supplies the heading and close control —
// the parent outcome is set via the clickable tag in the modal header, so
// this form only owns the remaining fields. Only a top-level outcome (no
// parent) links to an impact; children inherit it from their ancestor.
// `editing` is null when creating, or the outcome being changed. `draft`
// prefills name and description when creating one the insight collector
// proposed.
export default function OutcomeForm({
  editing,
  draft,
  parent,
  parentOutcomeId,
  teams,
  projects,
  impacts = [],
  impactId,
  targets = [],
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
  onViewTarget,
  onSubmit,
  onCancel,
  onDelete,
}) {
  const [form, setForm] = useState(EMPTY);
  const [projectIds, setProjectIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        description: editing.description ?? '',
        team_id: editing.team_id ?? '',
        impact_id: editing.impact_id ?? '',
      });
      setProjectIds(new Set(projectsForOutcome(projects, editing).map((project) => String(project.id))));
    } else {
      // Adding a child from the tree: inherit the parent's team. Otherwise
      // default to the only team so the common single-team case needs no
      // picking; either can be cleared, since the team may not be known yet.
      setForm((current) => ({
        ...EMPTY,
        name: draft?.name ?? '',
        description: draft?.description ?? '',
        team_id: parent?.team_id
          ? String(parent.team_id)
          : current.team_id || (teams.length === 1 ? String(teams[0].id) : ''),
        impact_id: impactId ? String(impactId) : '',
      }));
      setProjectIds(new Set());
    }
    setError(null);
    // projects is left out on purpose: a refetch mid-edit shouldn't wipe picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, parent, impactId]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        team_id: form.team_id ? Number(form.team_id) : null,
        // Links live in project_outcomes; the older single-project column is
        // folded into them, so clear it or a removed pick would keep showing.
        project_id: null,
        project_ids: [...projectIds].map(Number),
        parent_outcome_id: parentOutcomeId ? Number(parentOutcomeId) : null,
        impact_id: !parentOutcomeId && form.impact_id ? Number(form.impact_id) : null,
      });
      if (!editing) {
        setForm((current) => ({ ...EMPTY, team_id: current.team_id }));
        setProjectIds(new Set());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="outcome-form" onSubmit={submit}>
      <label>
        Name
        <input
          autoFocus
          value={form.name}
          placeholder="e.g. Cut onboarding time to under a day"
          onChange={(event) => update('name', event.target.value)}
        />
      </label>

      <label>
        Description
        <textarea
          rows={3}
          value={form.description}
          placeholder="What does success look like?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <label>
        Team
        <select value={form.team_id} onChange={(event) => update('team_id', event.target.value)}>
          <option value="">No team yet</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      <MultiSelect
        label="Projects"
        placeholder="Select projects…"
        items={projects}
        selected={projectIds}
        onChange={setProjectIds}
      />

      {!parentOutcomeId && impacts.length > 0 && (
        <label>
          Impact
          <select value={form.impact_id} onChange={(event) => update('impact_id', event.target.value)}>
            <option value="">None</option>
            {impacts.map((impact) => (
              <option key={impact.id} value={impact.id}>
                {impact.name}
              </option>
            ))}
          </select>
          <span className="hint">The business result this outcome is meant to drive.</span>
        </label>
      )}

      <TargetsSection
        targets={targets}
        saved={Boolean(editing)}
        onAdd={onAddTarget}
        onEdit={onEditTarget}
        onDelete={onDeleteTarget}
        onView={onViewTarget}
      />

      {error && <p className="error">{error}</p>}

      <div className="actions form-actions">
        {editing && (
          <button type="button" className="ghost danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-outcome" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add outcome'}
        </button>
      </div>
    </form>
  );
}
