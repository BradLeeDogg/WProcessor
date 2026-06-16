import { useStore } from './store/useStore'
import Launcher from './components/Launcher'
import Workspace from './components/Workspace'

export default function App(): JSX.Element {
  const hasProject = useStore((s) => s.meta !== null)
  return hasProject ? <Workspace /> : <Launcher />
}
