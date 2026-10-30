// CSV connector: a CSV export → SourceDocument[] (design.md §2.1). One row is
// one document by default (a feedback log, survey responses); `unit: 'file'`
// makes the whole file one (an interview synthesis).

// RFC 4180: quoted fields may hold commas, newlines and "" for a quote.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

// Header names each role is found under when the mapping doesn't name a column.
const GUESSES = {
  id: ['id', 'key', 'issue key', 'ticket id', 'response id'],
  date: ['date', 'created', 'created at', 'created_at', 'occurred_at', 'timestamp', 'submitted at'],
  customer: ['customer', 'company', 'account', 'organization', 'organisation'],
  url: ['url', 'link'],
  title: ['title', 'summary', 'subject'],
};

function findColumn(header, wanted, role) {
  const names = header.map((name) => name.trim().toLowerCase());
  if (wanted) {
    const index = names.indexOf(wanted.trim().toLowerCase());
    if (index === -1) throw new Error(`no column "${wanted}" for ${role}; the columns are: ${header.join(', ')}`);
    return index;
  }
  const index = names.findIndex((name) => GUESSES[role].includes(name));
  return index === -1 ? null : index;
}

// A date the API takes: a bare YYYY-MM-DD as it is, anything else Date can
// read as ISO 8601, otherwise none.
function toDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// options: { fileName, sourceSystem = 'csv', unit = 'row', columns: { id, date,
// customer, url, title } }. Each row's text is its cells as `column: value`
// lines, as the collect-insights skill records them, so a document turned into
// an eval case reads the same as it did here.
export function csvDocuments(text, { fileName, sourceSystem = 'csv', unit = 'row', columns = {} } = {}) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  if (unit === 'file') {
    return [{ source_system: sourceSystem, external_id: fileName, url: null, title: fileName, text: text.trim(), occurred_at: null, customer: null, firsthand: null, metadata: {} }];
  }
  if (unit !== 'row') throw new Error(`unit must be row or file, not "${unit}"`);
  const at = Object.fromEntries(Object.keys(GUESSES).map((role) => [role, findColumn(header, columns[role], role)]));
  const cell = (cells, role) => (at[role] === null ? null : cells[at[role]]?.trim() || null);
  return rows.map((cells, i) => ({
    source_system: sourceSystem,
    // Data rows count from 1 after the header, as in the skill.
    external_id: cell(cells, 'id') ?? `${fileName} · row ${i + 1}`,
    url: cell(cells, 'url'),
    title: cell(cells, 'title'),
    text: header
      .map((name, column) => [name.trim(), (cells[column] ?? '').trim()])
      .filter(([, value]) => value)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n'),
    occurred_at: toDate(cell(cells, 'date')),
    customer: cell(cells, 'customer'),
    firsthand: null,
    metadata: {},
  }));
}
