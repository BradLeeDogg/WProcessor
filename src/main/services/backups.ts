import { createWriteStream, promises as fs } from 'fs'
import { basename, join } from 'path'
import archiver from 'archiver'
import type { BackupInfo } from '@shared/types'
import type { DB } from './db'
import { projectPaths } from './paths'

function timestamp(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/**
 * Zip the whole project folder into backups/ with a timestamped name. The DB is
 * WAL-checkpointed first so the captured project.db is self-contained, and the
 * backups/ folder is excluded so archives don't nest into each other.
 */
export async function createBackup(root: string, db?: DB): Promise<BackupInfo> {
  const paths = projectPaths(root)
  await fs.mkdir(paths.backups, { recursive: true })
  try {
    db?.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* best effort — a checkpoint failure shouldn't block a backup */
  }

  const fileName = `${basename(root)}-${timestamp()}.zip`
  const outPath = join(paths.backups, fileName)

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('warning', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') reject(err)
    })
    archive.on('error', reject)
    archive.pipe(output)
    archive.glob('**/*', { cwd: root, ignore: ['backups/**', '**/*.tmp'] })
    archive.finalize()
  })

  const stat = await fs.stat(outPath)
  return { fileName, path: outPath, createdAt: Date.now(), sizeBytes: stat.size }
}

export async function listBackups(root: string): Promise<BackupInfo[]> {
  const paths = projectPaths(root)
  let entries: string[]
  try {
    entries = await fs.readdir(paths.backups)
  } catch {
    return []
  }
  const infos: BackupInfo[] = []
  for (const name of entries) {
    if (!name.endsWith('.zip')) continue
    const p = join(paths.backups, name)
    const stat = await fs.stat(p)
    infos.push({ fileName: name, path: p, createdAt: stat.mtimeMs, sizeBytes: stat.size })
  }
  return infos.sort((a, b) => b.createdAt - a.createdAt)
}

/** Keep the newest `keep` backups; delete the rest. */
export async function pruneBackups(root: string, keep: number): Promise<void> {
  const infos = await listBackups(root)
  for (const old of infos.slice(Math.max(0, keep))) {
    await fs.rm(old.path, { force: true })
  }
}

/** Runs periodic backups for an open project; started on open, stopped on close. */
export class BackupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly root: string,
    private readonly db: DB,
    private readonly intervalMs: number,
    private readonly keep: number
  ) {}

  start(): void {
    this.stop()
    this.timer = setInterval(() => {
      this.run().catch((err) => console.error('automatic backup failed:', err))
    }, this.intervalMs)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async run(): Promise<BackupInfo> {
    const info = await createBackup(this.root, this.db)
    await pruneBackups(this.root, this.keep)
    return info
  }
}
