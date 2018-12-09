const { app, BrowserWindow, ipcMain: ipc, globalShortcut, systemPreferences, dialog } = require('electron')
const { execSync, exec } = require('child_process')
const os = require('os')
const path = require('path')
const notifier = require('node-notifier')
const _ = require('lodash')
const fs = require('fs')
const semver = require('semver')
const axios = require('axios')

class APP {
  constructor () {
    this.appId = 'xyz.andv.yamu'
    this.repoName = '4ndv/yamu'

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

    this.checkForUpdates()
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
    // if (!this.checkMediaAccessibilitySettings()) {
    //   console.error('Failed to register global shortcuts')

    //   dialog.showMessageBox(this.window, {
    //     type: 'info',
    //     buttons: ['Открыть системные настройки...', 'OK'],
    //     message: 'Для работы медиа-кнопок разрешите доступ в разделе "Защита и безопасность -> Конфиденциальность -> Универсальный доступ" системных настроек и перезапустите приложение'
    //   }, (index) => {
    //     if (index === 0) {
    //       exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')
    //     }
    //   })

    //   return
    // }

    console.log('Media key register status:', globalShortcut.register('MediaNextTrack', () => {
      console.log('medianexttrack pressed')

      this.sendMediaAction('next')
    }))

    console.log('Media key register status:', globalShortcut.register('MediaPreviousTrack', () => {
      console.log('mediaprevioustrack pressed')

      this.sendMediaAction('previous')
    }))

    console.log('Media key register status:', globalShortcut.register('MediaPlayPause', () => {
      console.log('mediaplaypause pressed')

      this.sendMediaAction('playpause')
    }))

    console.log('Media key register status:', globalShortcut.register('MediaStop', () => {
      console.log('mediastop pressed')

      this.sendMediaAction('stop')
    }))

    // Unregistering on quit
    app.on('will-quit', () => {
      globalShortcut.unregisterAll()
    })
  }

  checkMediaAccessibilitySettings () {
    // TODO: Monitor this issue: electron#14837
    // TODO: Wait until electron 4.0.0-beta9!
    return true
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

  checkForUpdates () {
    axios.get(`https://api.github.com/repos/${this.repoName}/releases/latest`)
      .then(({ data }) => {

        const currentVersion = semver.coerce(app.getVersion())
        const latestRelease = semver.coerce(data.tag_name)

        if (semver.gt(latestRelease, currentVersion)) {
          dialog.showMessageBox(this.window, {
            type: 'info',
            buttons: ['Перейти к скачиванию', 'Oтмена'],
            message: `Доступна новая версия ${data.tag_name}!\n\n${data.body}\n`
          }, (index) => {
            if (index === 0) {
              exec('open "https://github.com/4ndv/yamu/releases"')
            }
          })
        }
      })
      .catch((error) => {
        console.error('Error during updates check')
        console.error(error)
      })
  }
}

// Allow audio play without user interaction
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Some WebAudio API stuff
app.commandLine.appendSwitch('enable-experimental-web-platform-features', '1')

app.on('ready', () => {
  // Possible workaround for a freezing issue during start up
  setTimeout(() => { const yamu = new APP() }, 1000)
})
