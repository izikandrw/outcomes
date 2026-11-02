// Due dates come from a date input as UTC midnight, so months are read in UTC to
// avoid sliding a day back for anyone west of it.
export const monthKey = (value) => new Date(value).toISOString().slice(0, 7);

function nextMonth(key) {
  const date = new Date(`${key}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return monthKey(date);
}

const byDate = (field) => (a, b) => new Date(a[field]) - new Date(b[field]) || a.id - b.id;

// Places dated projects into the months they touch, earliest month first. A project
// is completed in the month it ends and in progress in every month from its start
// up to that one, so one starting and ending in the same month is listed once, as
// completed. With no end date it has not finished, so it stays in progress through
// this month and the last month on the roadmap, whichever is later.
export function roadmapMonths(projects, now = new Date()) {
  const dated = projects.filter((project) => project.start_at || project.end_at);
  const lastMonth = dated
    .flatMap((project) => [project.start_at, project.end_at])
    .filter(Boolean)
    .map(monthKey)
    .reduce((latest, key) => (key > latest ? key : latest), monthKey(now));

  const months = new Map();
  const month = (key) => {
    if (!months.has(key)) months.set(key, { key, inProgress: [], completed: [] });
    return months.get(key);
  };

  for (const project of dated) {
    const finish = project.end_at ? monthKey(project.end_at) : null;
    if (finish) month(finish).completed.push(project);
    if (!project.start_at) continue;
    const stop = finish ?? nextMonth(lastMonth);
    for (let key = monthKey(project.start_at); key < stop; key = nextMonth(key)) {
      month(key).inProgress.push(project);
    }
  }

  return [...months.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ key, inProgress, completed }) => ({
      key,
      inProgress: inProgress.sort(byDate('start_at')),
      completed: completed.sort(byDate('end_at')),
    }));
}

// The roadmap narrowed to when things finish: only the months something completes
// in, each listing just what completes then, so a project shows once, at its end.
export const completionMonths = (months) =>
  months
    .filter(({ completed }) => completed.length > 0)
    .map(({ key, completed }) => ({ key, inProgress: [], completed }));
