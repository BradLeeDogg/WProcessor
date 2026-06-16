import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { WProcessorAPI } from '@shared/api'

// The single, typed surface between renderer and main. The renderer never
// touches the filesystem, the database, or Node directly — only this bridge.
const api: WProcessorAPI = {
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
    setLabel: (id, labelId) => ipcRenderer.invoke('binder:setLabel', id, labelId),
    setStatus: (id, statusId) => ipcRenderer.invoke('binder:setStatus', id, statusId),
    setCollapsed: (id, collapsed) => ipcRenderer.invoke('binder:setCollapsed', id, collapsed),
    remove: (id) => ipcRenderer.invoke('binder:remove', id),
    move: (input) => ipcRenderer.invoke('binder:move', input)
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
