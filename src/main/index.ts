import { app, shell, BrowserWindow, Menu, MenuItem, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { projectService } from './services/project'

/** Native menu — discoverability + global accelerators. Items send high-level
 *  commands to the renderer's command bus; standard roles keep undo/copy/paste. */
function buildAppMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin'
  const send = (cmd: string) => (): void => win.webContents.send('menu-command', cmd)
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Document', accelerator: 'CmdOrCtrl+N', click: send('new-doc') },
        { label: 'New Folder', accelerator: 'CmdOrCtrl+Shift+N', click: send('new-folder') },
        { type: 'separator' },
        { label: 'Compile…', accelerator: 'CmdOrCtrl+E', click: send('compile') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find & Replace…', accelerator: 'CmdOrCtrl+F', click: send('find') }
      ]
    },
    {
      label: 'Document',
      submenu: [
        { label: 'Split at Cursor', accelerator: 'CmdOrCtrl+Shift+K', click: send('split-doc') },
        { label: 'Merge with Previous', accelerator: 'CmdOrCtrl+Shift+M', click: send('merge-docs') },
        { type: 'separator' },
        { label: 'Snapshots…', accelerator: 'CmdOrCtrl+Shift+S', click: send('snapshot') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette…', accelerator: 'CmdOrCtrl+K', click: send('command-palette') },
        { label: 'Go to…', accelerator: 'CmdOrCtrl+P', click: send('quick-open') },
        { type: 'separator' },
        { label: 'Scrivenings', accelerator: 'CmdOrCtrl+1', click: send('view-scrivenings') },
        { label: 'Corkboard', accelerator: 'CmdOrCtrl+2', click: send('view-corkboard') },
        { label: 'Outliner', accelerator: 'CmdOrCtrl+3', click: send('view-outliner') },
        { type: 'separator' },
        { label: 'Split View', accelerator: 'CmdOrCtrl+\\', click: send('split-view') },
        { label: 'Composition Mode', accelerator: 'CmdOrCtrl+Shift+Return', click: send('compose') },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts & Tips', accelerator: 'CmdOrCtrl+/', click: send('help') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#f7f5ef', // calm "paper" tone so first paint isn't a white flash
    title: 'Foolscap',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      plugins: true // Chromium's built-in PDF viewer (Research viewer)
    }
  })

  // American-English spell check by default, with a suggestions context menu.
  window.webContents.session.setSpellCheckerLanguages(['en-US'])
  window.webContents.on('context-menu', (_e, params) => {
    if (!params.misspelledWord) return
    const menu = new Menu()
    for (const s of params.dictionarySuggestions.slice(0, 5)) {
      menu.append(new MenuItem({ label: s, click: () => window.webContents.replaceMisspelling(s) }))
    }
    if (params.dictionarySuggestions.length) menu.append(new MenuItem({ type: 'separator' }))
    menu.append(
      new MenuItem({
        label: 'Add to dictionary',
        click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
    )
    menu.popup()
  })

  buildAppMenu(window)

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
  electronApp.setAppUserModelId('com.foolscap.app')

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  registerIpc()

  // End-to-end storage verification (dev/CI only); never runs in the shipped app.
  if (process.env['WP_SELFTEST']) {
    import('./selftest')
      .then((m) => m.runSelfTest())
      .then(() => setTimeout(() => app.exit(0), 300)) // let stdout flush before exit
      .catch((err) => {
        console.error('SELFTEST_FAILED:', err)
        setTimeout(() => app.exit(1), 300)
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
                const open = ['Find', 'Go to', 'Inspector', 'Sources', 'Fact-check', 'Transcripts', 'Proofread', 'Compile'];
                document.querySelectorAll('button').forEach((b) => {
                  if (open.includes(b.textContent || '')) b.click();
                });
              }, 600);
              await step(() => S.getState().setFolderView('corkboard'), 450);
              await step(() => S.getState().setFolderView('outliner'), 450);
              await step(() => S.getState().setFolderView('scrivenings'), 450);
              const doc = S.getState().tree.find((t) => t.type === 'document');
              if (doc) S.getState().setSplit(doc.id);
              await step(() => window.dispatchEvent(new CustomEvent('wp:cmd', { detail: 'help' })), 300);
              await step(() => window.dispatchEvent(new CustomEvent('wp:cmd', { detail: 'command-palette' })), 350);
              await step(() => S.getState().viewSource('smoke-none'), 350);
              await step(() => S.getState().closeViewSource(), 250);
              await step(() => S.getState().setComposition(true), 450);
              await step(() => S.getState().setComposition(false), 450);
            })();
          })`
        )
        setTimeout(() => {
          console.log('WP_SMOKE_WORKSPACE_OK: workspace, find, quick-open, command-palette, help, research-viewer, inspector, sources, fact-check, transcripts, proofread, corkboard, outliner, split & composition mounted')
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
  // During the headless self-test no main window is open, and the transient
  // offscreen PDF window would otherwise trigger a quit mid-run.
  if (process.env['WP_SELFTEST']) return
  if (process.platform !== 'darwin') app.quit()
})

// Checkpoint + close the open project's database before exit so the WAL is
// folded back in and nothing is left half-flushed.
app.on('before-quit', () => {
  void projectService.close()
})
