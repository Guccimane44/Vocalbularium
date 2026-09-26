// PostgreSQL bytea compares unsigned bytes lexicographically. Encoding the
// normalized lowercase text as big-endian UTF-16 preserves JavaScript's
// string < and > comparisons, including the BMP/astral boundary.
export function frontSortKey(text) {
  const bytes = Buffer.from(text.normalize('NFKC').toLowerCase(), 'utf16le');
  for (let index = 0; index < bytes.length; index += 2) {
    const low = bytes[index];
    bytes[index] = bytes[index + 1];
    bytes[index + 1] = low;
  }
  return bytes;
}
