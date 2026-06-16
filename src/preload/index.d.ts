import { ElectronAPI } from '@electron-toolkit/preload'
import type { WProcessorAPI } from '@shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: WProcessorAPI
  }
}
