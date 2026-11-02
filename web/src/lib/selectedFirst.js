// Moves what's already selected to the top of a dropdown's list, keeping each
// part in its existing order. Pass what was selected when the menu opened, not
// the live selection, so a row doesn't jump out from under the cursor when it's
// ticked.
export function selectedFirst(items, wasSelected) {
  return [...items.filter((item) => wasSelected(item)), ...items.filter((item) => !wasSelected(item))];
}
