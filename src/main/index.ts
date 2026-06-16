import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { projectService } from './services/project'

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#f7f5ef', // calm "paper" tone so first paint isn't a white flash
    title: 'WProcessor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['WP_SMOKE']) {
    // Surface renderer crashes/errors during a headless boot test.
    window.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) console.log('RENDERER_CONSOLE:', message)
    })
    window.webContents.on('render-process-gone', (_e, details) =>
      console.log('RENDER_PROCESS_GONE:', details.reason)
    )
  }

  window.on('ready-to-show', () => {
    window.show()
    // Headless CI/smoke boot: let the renderer mount + call the bridge, then exit.
    if (process.env['WP_SMOKE']) {
      setTimeout(() => {
        console.log('WP_SMOKE_OK: window booted, renderer mounted')
        app.quit()
      }, 1200)
    }
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wprocessor.app')

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  registerIpc()

  // End-to-end storage verification (dev/CI only); never runs in the shipped app.
  if (process.env['WP_SELFTEST']) {
    import('./selftest')
      .then((m) => m.runSelfTest())
      .then(() => app.exit(0))
      .catch((err) => {
        console.error('SELFTEST_FAILED:', err)
        app.exit(1)
      })
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Checkpoint + close the open project's database before exit so the WAL is
// folded back in and nothing is left half-flushed.
app.on('before-quit', () => {
  void projectService.close()
})
