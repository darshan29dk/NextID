// Shared pagination-number helper used by every paginated table in the app.
// Rendering one button per page (Array.from({ length: totalPages })) breaks
// down once a list has more than a handful of pages - with 1000 rows at 10
// per page that's 100 buttons in a single row, which overflows the footer
// and pushes the Next arrow off-screen entirely. This returns a bounded
// window instead: first page, last page, a few pages around the current
// one, and '...' markers for the gaps - so the footer always fits and the
// Prev/Next controls stay visible no matter how many pages there are.
export function getPageNumbers(current, total, delta = 1) {
  if (total <= 0) return [];

  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }

  const withDots = [];
  let last = null;
  for (const i of range) {
    if (last !== null) {
      if (i - last === 2) {
        withDots.push(last + 1);
      } else if (i - last > 1) {
        withDots.push('...');
      }
    }
    withDots.push(i);
    last = i;
  }

  return withDots;
}
