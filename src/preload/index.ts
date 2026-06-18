import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FoolscapAPI } from '@shared/api'

// The single, typed surface between renderer and main. The renderer never
// touches the filesystem, the database, or Node directly — only this bridge.
const api: FoolscapAPI = {
  onMenuCommand: (cb) => {
    ipcRenderer.on('menu-command', (_e, cmd: string) => cb(cmd))
  },
  app: {
    health: () => ipcRenderer.invoke('app:health'),
    getRecentProjects: () => ipcRenderer.invoke('app:getRecentProjects'),
    removeRecentProject: (path) => ipcRenderer.invoke('app:removeRecentProject', path),
    pickNewProjectLocation: () => ipcRenderer.invoke('app:pickNewProjectLocation'),
    pickExistingProject: () => ipcRenderer.invoke('app:pickExistingProject')
  },
  project: {
    create: (opts) => ipcRenderer.invoke('project:create', opts),
    open: (path) => ipcRenderer.invoke('project:open', path),
    close: () => ipcRenderer.invoke('project:close'),
    getMeta: () => ipcRenderer.invoke('project:getMeta'),
    updateSettings: (patch) => ipcRenderer.invoke('project:updateSettings', patch)
  },
  binder: {
    list: () => ipcRenderer.invoke('binder:list'),
    create: (input) => ipcRenderer.invoke('binder:create', input),
    rename: (id, title) => ipcRenderer.invoke('binder:rename', id, title),
    updateSynopsis: (id, synopsis) => ipcRenderer.invoke('binder:updateSynopsis', id, synopsis),
    updateNotes: (id, notes) => ipcRenderer.invoke('binder:updateNotes', id, notes),
    setLabel: (id, labelId) => ipcRenderer.invoke('binder:setLabel', id, labelId),
    setStatus: (id, statusId) => ipcRenderer.invoke('binder:setStatus', id, statusId),
    setCollapsed: (id, collapsed) => ipcRenderer.invoke('binder:setCollapsed', id, collapsed),
    remove: (id) => ipcRenderer.invoke('binder:remove', id),
    restore: (id) => ipcRenderer.invoke('binder:restore', id),
    listTrash: () => ipcRenderer.invoke('binder:listTrash'),
    purge: (id) => ipcRenderer.invoke('binder:purge', id),
    emptyTrash: () => ipcRenderer.invoke('binder:emptyTrash'),
    mergeWithPrevious: (id) => ipcRenderer.invoke('binder:mergeWithPrevious', id),
    move: (input) => ipcRenderer.invoke('binder:move', input),
    applyOverlay: (overlay) => ipcRenderer.invoke('binder:applyOverlay', overlay)
  },
  document: {
    read: (id) => ipcRenderer.invoke('document:read', id),
    write: (id, content) => ipcRenderer.invoke('document:write', id, content)
  },
  snapshot: {
    create: (itemId, name) => ipcRenderer.invoke('snapshot:create', itemId, name),
    list: (itemId) => ipcRenderer.invoke('snapshot:list', itemId),
    read: (snapshotId) => ipcRenderer.invoke('snapshot:read', snapshotId),
    restore: (snapshotId) => ipcRenderer.invoke('snapshot:restore', snapshotId),
    remove: (snapshotId) => ipcRenderer.invoke('snapshot:remove', snapshotId)
  },
  backup: {
    runNow: () => ipcRenderer.invoke('backup:runNow'),
    list: () => ipcRenderer.invoke('backup:list')
  },
  window: {
    setFullScreen: (on) => ipcRenderer.invoke('window:setFullScreen', on),
    isFullScreen: () => ipcRenderer.invoke('window:isFullScreen')
  },
  search: {
    run: (criteria) => ipcRenderer.invoke('search:run', criteria)
  },
  collection: {
    list: () => ipcRenderer.invoke('collection:list'),
    create: (name, criteria) => ipcRenderer.invoke('collection:create', name, criteria),
    remove: (id) => ipcRenderer.invoke('collection:remove', id)
  },
  metadata: {
    listFields: () => ipcRenderer.invoke('metadata:listFields'),
    createField: (name, type, options) =>
      ipcRenderer.invoke('metadata:createField', name, type, options),
    updateField: (id, patch) => ipcRenderer.invoke('metadata:updateField', id, patch),
    removeField: (id) => ipcRenderer.invoke('metadata:removeField', id),
    getValues: (itemId) => ipcRenderer.invoke('metadata:getValues', itemId),
    setValue: (itemId, fieldId, value) =>
      ipcRenderer.invoke('metadata:setValue', itemId, fieldId, value)
  },
  source: {
    list: () => ipcRenderer.invoke('source:list'),
    capture: (url) => ipcRenderer.invoke('source:capture', url),
    createManual: (input) => ipcRenderer.invoke('source:createManual', input),
    importFile: () => ipcRenderer.invoke('source:importFile'),
    remove: (id) => ipcRenderer.invoke('source:remove', id),
    update: (id, patch) => ipcRenderer.invoke('source:update', id, patch),
    open: (id) => ipcRenderer.invoke('source:open', id),
    openExternal: (id) => ipcRenderer.invoke('source:openExternal', id)
  },
  clipboard: {
    write: (text, html) => ipcRenderer.invoke('clipboard:write', text, html)
  },
  spellcheck: {
    setDialect: (dialect) => ipcRenderer.invoke('spellcheck:setDialect', dialect)
  },
  transcript: {
    list: () => ipcRenderer.invoke('transcript:list'),
    get: (id) => ipcRenderer.invoke('transcript:get', id),
    create: (title) => ipcRenderer.invoke('transcript:create', title),
    rename: (id, title) => ipcRenderer.invoke('transcript:rename', id, title),
    remove: (id) => ipcRenderer.invoke('transcript:remove', id),
    parse: (id, raw) => ipcRenderer.invoke('transcript:parse', id, raw),
    addSegment: (id) => ipcRenderer.invoke('transcript:addSegment', id),
    updateSegment: (segmentId, patch) =>
      ipcRenderer.invoke('transcript:updateSegment', segmentId, patch),
    removeSegment: (segmentId) => ipcRenderer.invoke('transcript:removeSegment', segmentId)
  },
  factcheck: {
    listClaims: (docId) => ipcRenderer.invoke('factcheck:listClaims', docId),
    createClaim: (docId, text) => ipcRenderer.invoke('factcheck:createClaim', docId, text),
    updateClaim: (id, patch) => ipcRenderer.invoke('factcheck:updateClaim', id, patch),
    removeClaim: (id) => ipcRenderer.invoke('factcheck:removeClaim', id),
    linkSource: (claimId, sourceId) =>
      ipcRenderer.invoke('factcheck:linkSource', claimId, sourceId),
    unlinkSource: (claimId, sourceId) =>
      ipcRenderer.invoke('factcheck:unlinkSource', claimId, sourceId),
    outstanding: () => ipcRenderer.invoke('factcheck:outstanding')
  },
  compile: {
    docx: (req) => ipcRenderer.invoke('compile:docx', req),
    pdf: (req) => ipcRenderer.invoke('compile:pdf', req),
    epub: (req) => ipcRenderer.invoke('compile:epub', req),
    markdown: (req) => ipcRenderer.invoke('compile:markdown', req),
    text: (req) => ipcRenderer.invoke('compile:text', req)
  },
  importer: {
    file: (parentId) => ipcRenderer.invoke('import:file', parentId),
    scrivener: (parentId) => ipcRenderer.invoke('import:scrivener', parentId)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback when contextIsolation is off — not used in production)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
