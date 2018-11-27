const { app, BrowserWindow, ipcMain: ipc, globalShortcut, systemPreferences } = require('electron')
const path = require('path')
const notifier = require('node-notifier')
const _ = require('lodash')
const fs = require('fs')

class APP {
  constructor () {
    this.window = new BrowserWindow({
      title: 'Yamu',
      width: 1100,
      height: 750,
      webPreferences: {
        nodeIntegration: false,
        preload: path.join(__dirname, 'inject.js')
      }
    })

    // Inject css for our own fixes
    this.window.webContents.on('dom-ready', () => {
      this.window.webContents.insertCSS(fs.readFileSync(path.join(__dirname, 'inject.css')).toString().replace(/\n/g, ' '))
    })

    this.window.loadURL('https://music.yandex.ru')

    ipc.on('events', this.processEvents.bind(this))

    // Bring window to front on notification click
    notifier.on('click', (notifierObject, options) => {
      console.log('Clicked on notification')
      this.window.show()
    })

    this.initMediaKeys()
  }

  processEvents (sender, { type, data }) {
    switch (type) {
      case 'API_READY':
        console.log('externalAPI ready')
        break
      case 'TRACK':
        this.trackNotify(data)
        break
      case 'THEME':
        this.handleThemeChange(data)
        break
      default:
        console.error('UNKNOWN EVENT', type, data)
    }
  }

  trackNotify (track) {
    const title = _.get(track, 'title', 'Unknown track')

    let cover = _.get(track, 'cover', false)

    if (cover) {
      cover = `https://${cover.replace('%%', '80x80')}`
    }

    const artist = _.get(track, 'artists[0].title', 'Unknown artist')

    const album = _.get(track, 'album.title', 'Unknown album')

    notifier.notify({
      title: track.title,
      message: `${artist} — ${album}`,
      icon: cover,
      wait: true
    })
  }

  initMediaKeys () {
    console.log('Register media key status', globalShortcut.register('medianexttrack', () => {
      console.log('medianexttrack pressed')

      this.sendMediaAction('next')
    }))

    console.log('Register media key status', globalShortcut.register('mediaprevioustrack', () => {
      console.log('mediaprevioustrack pressed')

      this.sendMediaAction('previous')
    }))

    console.log('Register media key status', globalShortcut.register('mediaplaypause', () => {
      console.log('mediaplaypause pressed')

      this.sendMediaAction('playpause')
    }))

    console.log('Register media key status', globalShortcut.register('mediastop', () => {
      console.log('mediastop pressed')

      this.sendMediaAction('stop')
    }))

    // Unregistering on quit
    app.on('will-quit', () => {
      globalShortcut.unregisterAll()
    })
  }

  sendMediaAction (action) {
    this.window.webContents.send('media-actions', { action })
  }

  handleThemeChange ({ name }) {
    let appearance = 'light'

    if (name === 'black') appearance = 'dark'

    // Temporarily disabled, because it's supported only in electron 4.0.0 beta, which has broken cookies persistence
    // TODO: montior electron#15365

    // Short delay to match yandex
    // setTimeout(() => systemPreferences.setAppLevelAppearance(appearance), 100)
  }
}

// Allow audio play without user interaction
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.on('ready', () => {
  const yamu = new APP()
})
