// Free text with any http(s) URLs in it turned into links that open in a new tab.
const URL_PATTERN = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

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
