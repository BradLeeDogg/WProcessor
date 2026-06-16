import { app } from 'electron'
import { join } from 'path'
import type { RecentProject } from '@shared/types'
import { readJson, writeJsonAtomic } from './atomic'

const MAX_RECENTS = 20

function recentsFile(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

export async function getRecents(): Promise<RecentProject[]> {
  const list = (await readJson<RecentProject[]>(recentsFile())) ?? []
  return list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

export async function addRecent(entry: RecentProject): Promise<void> {
  const list = (await readJson<RecentProject[]>(recentsFile())) ?? []
  const next = [entry, ...list.filter((r) => r.path !== entry.path)].slice(0, MAX_RECENTS)
  await writeJsonAtomic(recentsFile(), next)
}

export async function removeRecent(path: string): Promise<RecentProject[]> {
  const list = (await readJson<RecentProject[]>(recentsFile())) ?? []
  const next = list.filter((r) => r.path !== path)
  await writeJsonAtomic(recentsFile(), next)
  return next.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}
