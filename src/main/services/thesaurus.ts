import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { ThesaurusSense } from '@shared/api'

/**
 * Offline thesaurus backed by the WordNet-derived data file
 * (resources/thesaurus.txt, built at package time). The file is one line per
 * word — "word<TAB>sensesJSON" — so we keep compact strings in memory and parse
 * only the looked-up entry. Loaded lazily on first use.
 */

type RawSense = [string, string, string[], string[]] // [pos, def, syns, ants]

let index: Map<string, string> | null = null

function dataPath(): string | null {
  // Packaged (extraResources), dev build, and headless test (cwd) — first hit wins.
  const candidates = [
    join(process.resourcesPath, 'thesaurus.txt'),
    join(app.getAppPath(), 'resources', 'thesaurus.txt'),
    join(process.cwd(), 'resources', 'thesaurus.txt')
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

function ensureLoaded(): Map<string, string> {
  if (index) return index
  index = new Map()
  try {
    const p = dataPath()
    if (!p) return index
    const text = readFileSync(p, 'utf8')
    for (const line of text.split('\n')) {
      const tab = line.indexOf('\t')
      if (tab > 0) index.set(line.slice(0, tab), line.slice(tab + 1))
    }
  } catch {
    /* missing/unreadable data → empty thesaurus */
  }
  return index
}

/** Load the data ahead of first use so the initial lookup isn't slow. */
export function warm(): void {
  ensureLoaded()
}

/** Best-effort base forms when an exact entry isn't found (plurals, -ed, -ing). */
function morphedForms(w: string): string[] {
  const out: string[] = []
  if (w.endsWith('ies')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) out.push(w.slice(0, -2))
  if (w.endsWith('s')) out.push(w.slice(0, -1))
  if (w.endsWith('ed')) out.push(w.slice(0, -2), w.slice(0, -1))
  if (w.endsWith('ing')) out.push(w.slice(0, -3), w.slice(0, -3) + 'e')
  return out
}

/** Synonym/antonym senses for a word (case-insensitive; empty if none). */
export function lookup(word: string): ThesaurusSense[] {
  const map = ensureLoaded()
  const w = word.trim().toLowerCase()
  if (!w) return []
  let raw = map.get(w)
  if (!raw) {
    for (const form of morphedForms(w)) {
      raw = map.get(form)
      if (raw) break
    }
  }
  if (!raw) return []
  try {
    return (JSON.parse(raw) as RawSense[]).map(([pos, def, syns, ants]) => ({ pos, def, syns, ants }))
  } catch {
    return []
  }
}

/** A de-duplicated, word-excluding synonym list across senses (for quick menus). */
export function flatSynonyms(word: string, limit = 12): string[] {
  const self = word.trim().toLowerCase()
  const out: string[] = []
  for (const sense of lookup(word)) {
    for (const s of sense.syns) {
      if (s !== self && !out.includes(s)) out.push(s)
      if (out.length >= limit) return out
    }
  }
  return out
}
