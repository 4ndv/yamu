const { app, BrowserWindow, ipcMain: ipc, globalShortcut, systemPreferences, dialog } = require('electron')
const { exec } = require('child_process')
const path = require('path')
const notifier = require('node-notifier')
const _ = require('lodash')
const fs = require('fs')
const semver = require('semver')
const axios = require('axios')
const accessibilityCheck = require('mac-accessibility-features-check')

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

    const liked = _.get(track, 'liked', false)

    let cover = _.get(track, 'cover', false)

    if (cover) {
      cover = `https://${cover.replace('%%', '80x80')}`
    }

    let prefix = ''

    if (liked) {
      prefix = '♥️ '
    }

    const artist = _.get(track, 'artists[0].title', 'Unknown artist')

    const album = _.get(track, 'album.title', 'Unknown album')

    const SKIP_LABEL = 'Пропустить'
    const LIKE_LABEL = '♥️'

    const notificationData = {
      title: track.title,
      message: `${prefix}${artist} — ${album}`,
      icon: cover,
      wait: true
    }

    // node-notifier is a total clusterfuck and closeLabel doesn't work without actions o_O
    if (liked) {
      notificationData.actions = SKIP_LABEL
    } else {
      notificationData.closeLabel = SKIP_LABEL
      notificationData.actions = LIKE_LABEL
    }

    notifier.notify(
      notificationData,
      (error, response, metadata) => {
        console.log('Notification response:', response, metadata)

        switch (_.get(metadata, 'activationValue', null)) {
        case SKIP_LABEL:
          this.sendMediaAction('next')
          break
        case LIKE_LABEL:
          this.sendMediaAction('like')
          break
        }
      }
    )
  }

  accessibilityDialog () {
    const text = 'Для работы медиа-кнопок разрешите доступ в появившемся окне, либо в разделе "Защита и безопасность -> Конфиденциальность -> Универсальный доступ" системных настроек.\n\nЕсли галочка уже стоит - уберите её и поставьте заново.\n\nПосле нажатия "Перезапустить" приложение будет перезапущено для применения изменений.'

    dialog.showMessageBox(this.window, {
      type: 'info',
      buttons: ['Открыть системные настройки...', 'Напомнить позже', 'Перезапустить'],
      message: text
    }, (index) => {
      if (index === 0) {
        exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')

        this.accessibilityDialog() // Call it again
      } else if (index === 2) {
        app.relaunch()
        app.exit(0)
      }
    })
  }

  initMediaKeys () {
    const accessibilityGranted = accessibilityCheck.check()

    if (!accessibilityGranted) {
      this.accessibilityDialog()

      setTimeout(() => accessibilityCheck.checkAndPrompt(), 1500)
    } else {
      this.registerMediaKeys()
    }
  }

  registerMediaKeys () {
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

  sendMediaAction (action) {
    this.window.webContents.send('media-actions', { action })
  }

  handleThemeChange ({ name }) {
    let appearance = 'light'

    if (name === 'black') appearance = 'dark'

    // Short delay to match yandex animation
    setTimeout(() => systemPreferences.setAppLevelAppearance(appearance), 100)
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

// Closing app when all windows is closed
app.on('window-all-closed', () => {
  app.quit()
})

app.on('ready', () => {
  // Possible workaround for a freezing issue during start up
  setTimeout(() => { const yamu = new APP() }, 1000)
})
