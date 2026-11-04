// Var appen körs: som vanlig webbsida eller som Claude-artifact.
// I artifacten är utskrift, nedladdningslänkar, confirm()/prompt() och mikrofon blockerade,
// så funktionerna går via plattformens egna förmågor (claude.use) i stället.

export const isArtifact = import.meta.env.VITE_TARGET === 'artifact'

/** Utskrift (window.print) fungerar inte i artifacten. */
export const canPrint = !isArtifact

/** Mikrofon (inspelning och taligenkänning i webbläsaren) är blockerad i artifacten. */
export const canUseMicrophone = !isArtifact

interface ClaudeWindow {
  claude?: { use(name: string): Promise<unknown> }
}

/** Hämtar en av artifactens förmågor (db, user, assets, downloads). null utanför artifacten. */
export function claudeUse<T>(name: string): Promise<T | null> {
  const c = (window as unknown as ClaudeWindow).claude
  if (!isArtifact || !c?.use) return Promise.resolve(null)
  return c.use(name).then((v) => (v ?? null) as T | null).catch(() => null)
}

interface Downloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>
}

const SAVE_ERRORS: Record<string, string> = {
  rejected_extension: 'Filtypen kan inte sparas här.',
  extension_not_enabled: 'Filtypen kan inte sparas här.',
  too_large: 'Filen är för stor för att sparas här.',
  rate_limited: 'Vänta ett ögonblick och försök igen.',
}

/**
 * Sparar en fil till besökarens enhet. I artifacten visas plattformens egen
 * bekräftelse; avböjer besökaren returneras false. Kastar ett fel med en svensk
 * förklaring om det inte gick.
 */
export async function saveFile(filename: string, data: Blob | string, mime = 'application/octet-stream'): Promise<boolean> {
  if (isArtifact) {
    const dl = await claudeUse<Downloads>('downloads')
    if (!dl) throw new Error('Nedladdning är inte tillgänglig i den här vyn.')
    try {
      await dl.save({ filename, data })
      return true
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      if (code === 'declined') return false
      throw new Error(SAVE_ERRORS[code] ?? 'Filen kunde inte sparas.')
    }
  }
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return true
}

/** localStorage/sessionStorage kan kasta i privata fönster och förhandsvisningar. */
export const safeStorage = {
  get(key: string, session = false): string | null {
    try {
      return (session ? sessionStorage : localStorage).getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null, session = false) {
    try {
      const s = session ? sessionStorage : localStorage
      if (value == null) s.removeItem(key)
      else s.setItem(key, value)
    } catch {
      /* lagring blockerad */
    }
  },
}
