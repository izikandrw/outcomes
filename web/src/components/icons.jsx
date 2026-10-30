// 16px stroke icons drawn in currentColor so they inherit button styling.
function Icon({ children }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const PlusIcon = () => (
  <Icon>
    <path d="M8 3.25v9.5M3.25 8h9.5" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M3.25 8h9.5" />
  </Icon>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M11.1 2.9a1.55 1.55 0 0 1 2.2 2.2L6.1 12.3l-2.9.8.8-2.9z" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M2.75 4.25h10.5M6.25 4.25V3a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v1.25M4.25 4.25l.55 8.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.55-8.1" />
  </Icon>
);

export const ListIcon = () => (
  <Icon>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </Icon>
);

// A node with two children below it, matching the shape of the tree view.
export const TreeIcon = () => (
  <Icon>
    <rect x="6" y="1.75" width="4" height="3" rx="1" />
    <rect x="1.75" y="11.25" width="4" height="3" rx="1" />
    <rect x="10.25" y="11.25" width="4" height="3" rx="1" />
    <path d="M8 4.75v3.5M3.75 11.25V8.25h8.5v3" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />
  </Icon>
);

export const ChevronDownIcon = () => (
  <Icon>
    <path d="M3.75 5.75L8 10.25l4.25-4.5" />
  </Icon>
);

export const WarningIcon = () => (
  <Icon>
    <path d="M8 2.4 14.5 13.5h-13z" />
    <path d="M8 6.5v3" />
    <path d="M8 11.6h.01" />
  </Icon>
);

export const ExpandIcon = () => (
  <Icon>
    <path d="M9.5 2.75h3.75V6.5M6.5 13.25H2.75V9.5M13.25 2.75 8.75 7.25M2.75 13.25l4.5-4.5" />
  </Icon>
);

export const ArrowLeftIcon = () => (
  <Icon>
    <path d="M13 8H3.5M7.5 4 3.5 8l4 4" />
  </Icon>
);

export const ArrowUpIcon = () => (
  <Icon>
    <path d="M8 13V3.5M4 7.5 8 3.5l4 4" />
  </Icon>
);

export const FilterIcon = () => (
  <Icon>
    <path d="M2.25 4h11.5M4.5 8h7M6.75 12h2.5" />
  </Icon>
);

export const SortIcon = () => (
  <Icon>
    <path d="M5 2.75v10.5M2.75 11 5 13.25 7.25 11M11 13.25V2.75M8.75 5 11 2.75 13.25 5" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.25 10.25 13.5 13.5" />
  </Icon>
);
