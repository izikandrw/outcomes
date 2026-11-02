// For a number field that is a plain text box, so it has no spinner and the
// arrow keys and scroll wheel can't change its value.

// What's left of typed or pasted text once it can only be a number on its way
// to being written: digits, one decimal point and a leading minus. "$1,200"
// becomes "1200".
export function numberDraft(text) {
  const negative = text.trimStart().startsWith('-');
  const [whole, ...fraction] = text.replace(/[^\d.]/g, '').split('.');
  const digits = fraction.length > 0 ? `${whole}.${fraction.join('')}` : whole;
  return negative ? `-${digits}` : digits;
}

// False for a draft that never became a number, like a lone "-" or ".".
export const isNumber = (draft) => draft !== '' && Number.isFinite(Number(draft));
