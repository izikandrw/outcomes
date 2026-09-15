import { useEffect, useState } from 'react';

// Creates a project already linked to the outcome it is meant to drive. The
// team defaults to the outcome's, since that is nearly always the same team.
export default function ProjectForm({ outcome, teams, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    team_id: outcome.team_id ? String(outcome.team_id) : '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.team_id && teams.length === 1) {
      setForm((current) => ({ ...current, team_id: String(teams[0].id) }));
    }
  }, [teams, form.team_id]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.team_id) return setError('Pick a team — the API requires one.');

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        team_id: Number(form.team_id),
        outcome_ids: [outcome.id],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="outcome-form" onSubmit={submit}>
      <p className="empty">
        This project will be linked to <strong>{outcome.name}</strong>.
      </p>

      <label>
        Name
        <input
          autoFocus
          value={form.name}
          placeholder="e.g. Rebuild the SSO setup step"
          onChange={(event) => update('name', event.target.value)}
        />
      </label>

      <label>
        Description
        <textarea
          rows={3}
          value={form.description}
          placeholder="What will this ship?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <label>
        <span className="label-text">
          Team <span className="required">required</span>
        </span>
        <select value={form.team_id} onChange={(event) => update('team_id', event.target.value)}>
          <option value="">Select a team…</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="actions form-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add project'}
        </button>
      </div>
    </form>
  );
}
