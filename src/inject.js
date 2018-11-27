// Скрипт, внедряемый в страницу ЯМ

const { ipcRenderer: ipc } = require('electron')

document.addEventListener('DOMContentLoaded', () => {
  try {
    // Я не хотел вырезать рекламу, но эти элементы сильно мешают в маленьком окне десктопного приложения
    // Прости, Яндекс :(
    document.querySelector('.d-overhead').remove()
    document.querySelector('.d-overhead-mobile').remove()
    document.querySelector('.bar > .bar-below').remove()
  } catch (error) {
    console.error('Error during nag removal')
    console.error(error)
  }

  externalAPI.on(externalAPI.EVENT_READY, () => {
    ipc.send('events', {
      type: 'API_READY'
    })
  })

  externalAPI.on(externalAPI.EVENT_TRACK, () => {
    const track = externalAPI.getCurrentTrack()

    ipc.send('events', {
      type: 'TRACK',
      data: track
    })
  })

  // Lowering ads volume twice
  externalAPI.on(externalAPI.EVENT_ADVERT, (status) => {
    const volume = +externalAPI.getVolume().toFixed(2)

    let nextVolume = null

    if (status === false) {
      nextVolume = volume * 2
    } else {
      nextVolume = volume / 2
    }

    externalAPI.setVolume(nextVolume)

    ipc.send('events', {
      type: 'ADVERT',
      data: { status }
    })
  })

  ipc.on('media-actions', (sender, { action }) => {
    switch (action) {
      case 'next':
        externalAPI.next()
        break
      case 'previous':
        externalAPI.prev()
        break
      case 'playpause':
      case 'stop':
        externalAPI.togglePause()
        break
      default:
        console.error('Unknown media action', action)
    }
  })

  // Интеграция с Mojave Dark Mode
  ipc.send('events', { type: 'THEME', data: { name: Mu.settings.theme } })

  // Отслеживание изменений темы
  Mu.settings = new Proxy(Mu.settings, {
    set(target, prop, value) {
      switch (prop) {
        case 'theme':
          ipc.send('events', { type: 'THEME', data: { name: value } })
          break
      }
    }
  })
})

