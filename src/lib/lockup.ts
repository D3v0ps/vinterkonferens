// Konferensens namn som namnlogotyp, som på omslaget och schemaaffischerna 2025:
// "ÅRLIGA / KONFERENSEN" – första ordet stort och resten under, raderna lika breda.
// Används av heron på startsidan och av schemabilden.

// Ett sammansatt namn delas före ändelsen: "Vinterkonferensen" → "VINTER / KONFERENSEN".
const SPLIT = /^(.{3,}?)(KONFERENSEN|KONFERENS|CONFERENCE|DAGARNA|DAGEN|HELGEN)$/

/** "Vinterkonferensen 2026" → ["VINTER", "KONFERENSEN"]; "Årliga Konferensen" → ["ÅRLIGA", "KONFERENSEN"]. */
export function lockupLines(name: string): string[] {
  const words = name
    .trim()
    .replace(/\s+\d{4}$/, '')
    .toLocaleUpperCase('sv-SE')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 1) {
    const m = SPLIT.exec(words[0])
    return m ? [m[1], m[2]] : words
  }
  return words.length ? [words[0], words.slice(1).join(' ')] : []
}
