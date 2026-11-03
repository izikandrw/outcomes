// The pages of the top nav, in the order it shows them. The command palette
// lists them too.
export const NAV_PAGES = [
  { id: 'map', label: 'Map' },
  { id: 'impacts', label: 'Impacts' },
  { id: 'outcomes', label: 'Outcomes' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'projects', label: 'Projects' },
  { id: 'insights', label: 'Insights' },
  {
    id: 'review',
    label: 'Review insights',
    hint: 'Insights the collector suggested, waiting for you to approve or reject before they count as evidence',
  },
  { id: 'teams', label: 'Teams' },
  { id: 'guide', label: 'Guide', hint: 'How to use Outcomes: the framework, and working with Claude and agents' },
];
