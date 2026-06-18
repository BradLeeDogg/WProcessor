/** Pure substring match finder (shared by the editor find/replace + self-test). */
export function findRanges(
  text: string,
  query: string,
  caseSensitive: boolean
): Array<[number, number]> {
  if (!query) return []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: Array<[number, number]> = []
  let i = hay.indexOf(needle)
  while (i !== -1) {
    out.push([i, i + needle.length])
    i = hay.indexOf(needle, i + needle.length) // non-overlapping
  }
  return out
}
