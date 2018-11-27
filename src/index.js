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
    if (!this.checkMediaAccessibilitySettings()) {
      console.error('Failed to register global shortcuts')

      dialog.showMessageBox(this.window, {
        type: 'info',
        buttons: ['Открыть системные настройки...', 'OK'],
        message: 'Для работы медиа-кнопок, пожалуйста, разрешите доступ в разделе "Защита и безопасность -> Конфиденциальность -> Универсальный доступ" системных настроек и перезапустите приложение'
      }, (index) => {
        if (index === 0) {
          exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')
        }
      })

      return
    }

    globalShortcut.register('medianexttrack', () => {
      console.log('medianexttrack pressed')

      this.sendMediaAction('next')
    })

    globalShortcut.register('mediaprevioustrack', () => {
      console.log('mediaprevioustrack pressed')

      this.sendMediaAction('previous')
    })

    globalShortcut.register('mediaplaypause', () => {
      console.log('mediaplaypause pressed')

      this.sendMediaAction('playpause')
    })

    globalShortcut.register('mediastop', () => {
      console.log('mediastop pressed')

      this.sendMediaAction('stop')
    })

    // Unregistering on quit
    app.on('will-quit', () => {
      globalShortcut.unregisterAll()
    })
  }

  checkMediaAccessibilitySettings () {
    const osRelease = semver.coerce(os.release())

    // TODO: Monitor this issue: electron#14837

    // Ignore OSes < Mojave
    // 18.0.0 is the darwin version for Mojave
    if (process.platform === 'darwin' && semver.lt(osRelease, '18.0.0')) {
      return true
    }

    const result = execSync(`sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" "SELECT allowed FROM access WHERE client = '${this.appId}' AND service = 'kTCCServiceAccessibility';"`).toString().trim()

    return result === '1'
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
          dialog.showMessageBox(null, {
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

app.on('ready', () => {
  const yamu = new APP()
})
