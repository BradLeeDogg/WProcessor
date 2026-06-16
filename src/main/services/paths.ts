import { join } from 'path'

export interface ProjectPaths {
  root: string
  db: string
  documents: string
  assets: string
  research: string
  snapshots: string
  backups: string
}

/** Standard layout of a `.writeproject` folder. */
export function projectPaths(root: string): ProjectPaths {
  return {
    root,
    db: join(root, 'project.db'),
    documents: join(root, 'documents'),
    assets: join(root, 'assets'),
    research: join(root, 'research'),
    snapshots: join(root, 'snapshots'),
    backups: join(root, 'backups')
  }
}

/** The set of directories that make up a project on disk. */
export function projectDirs(root: string): string[] {
  const p = projectPaths(root)
  return [p.documents, p.assets, p.research, p.snapshots, p.backups]
}

export function documentFile(root: string, id: string): string {
  return join(root, 'documents', `${id}.json`)
}

export function snapshotFile(root: string, id: string): string {
  return join(root, 'snapshots', `${id}.json`)
}
