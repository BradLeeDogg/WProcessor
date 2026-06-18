import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStore } from './store/useStore'
import type { OpenProjectResult } from '@shared/api'
import './styles/global.css'

// Headless E2E/smoke hooks: let a driver load a project + flip view modes
// without clicking. Renderer-only (local state); exposes no new capability.
const w = window as unknown as {
  __wpOpenResult?: (r: OpenProjectResult) => void
  __wpStore?: typeof useStore
}
w.__wpOpenResult = (r) => useStore.getState().openResult(r)
w.__wpStore = useStore

// Native-menu items dispatch to the in-renderer command bus.
import { runCommand, type AppCommand } from './lib/commands'
window.api.onMenuCommand((cmd) => runCommand(cmd as AppCommand))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
