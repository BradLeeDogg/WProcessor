import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'

/**
 * Write a file atomically: stream to a temp file in the same directory, fsync
 * it to durable storage, then rename over the target. rename(2) is atomic on a
 * single filesystem, so a reader never sees a half-written file and a crash
 * mid-write leaves the previous version intact. This is the core guarantee
 * behind "never risk my writing".
 */
export async function writeFileAtomic(filePath: string, data: string | Buffer): Promise<void> {
  const dir = dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${randomBytes(8).toString('hex')}.tmp`)
  const handle = await fs.open(tmp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync() // fsync — durability before the rename
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(tmp, filePath)
  } catch (err) {
    // Clean up the temp file if the rename failed, then surface the error.
    await fs.rm(tmp, { force: true })
    throw err
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(value))
}

/** Read+parse JSON, returning null if the file does not exist. */
export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
