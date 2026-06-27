import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Launcher from './components/Launcher'
import Workspace from './components/Workspace'

export default function App(): JSX.Element {
  const hasProject = useStore((s) => s.meta !== null)
  const theme = useStore((s) => s.meta?.settings.theme ?? 'paper')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  // A synonym chosen from the right-click thesaurus menu replaces the current
  // selection in the last-focused editor (same path as side-panel inserts).
  useEffect(() => {
    return window.api.onThesaurusReplace((synonym) => {
      useStore.getState().inserter?.(synonym)
    })
  }, [])
  return hasProject ? <Workspace /> : <Launcher />
}
