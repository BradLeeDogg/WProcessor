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
    if (process.env['WP_SMOKE']) console.log('WP_SMOKE_OK: window booted, renderer mounted')
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

  const win = createWindow()

  // Headless GUI smoke: drive the renderer into the Workspace + TipTap editor so
  // a runtime error in the editor path surfaces, then quit.
  if (process.env['WP_SMOKE']) {
    win.webContents.once('did-finish-load', async () => {
      try {
        const { tmpdir } = await import('os')
        const { promises: fsp } = await import('fs')
        const loc = await fsp.mkdtemp(join(tmpdir(), 'wp-smoke-'))
        // Open a project, then drive Scrivenings (folder), split view, and
        // composition mode so each Phase 2 path mounts under the error capture.
        await win.webContents.executeJavaScript(
          `window.api.project.create({ title: 'Smoke', type: 'novel', location: ${JSON.stringify(
            loc
          )} }).then((r) => {
            window.__wpOpenResult(r);
            const S = window.__wpStore;
            const step = (fn, ms) => new Promise((res) => setTimeout(() => { fn(); res(); }, ms));
            (async () => {
              const folder = S.getState().tree.find((t) => t.type === 'folder');
              if (folder) S.getState().select(folder.id);
              await step(() => {
                document.querySelectorAll('button').forEach((b) => {
                  if (b.textContent === 'Find' || b.textContent === 'Inspector') b.click();
                });
              }, 450);
              await step(() => S.getState().setFolderView('corkboard'), 450);
              await step(() => S.getState().setFolderView('outliner'), 450);
              await step(() => S.getState().setFolderView('scrivenings'), 450);
              const doc = S.getState().tree.find((t) => t.type === 'document');
              if (doc) S.getState().setSplit(doc.id);
              await step(() => S.getState().setComposition(true), 450);
              await step(() => S.getState().setComposition(false), 450);
            })();
          })`
        )
        setTimeout(() => {
          console.log('WP_SMOKE_WORKSPACE_OK: workspace, find, inspector, corkboard, outliner, split & composition mounted')
          app.quit()
        }, 4200)
      } catch (err) {
        console.error('WP_SMOKE_DRIVE_FAILED:', err)
        app.quit()
      }
    })
  }

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
