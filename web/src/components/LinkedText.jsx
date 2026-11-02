// Free text with any http(s) URLs in it turned into links that open in a new tab.
const URL_PATTERN = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

// The first http(s) URL in free text, or null when it has none.
export function firstUrl(text) {
  return text?.match(URL_PATTERN)?.[0] ?? null;
}

export default function LinkedText({ text }) {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
