function Krabby({ dormant = true } = {}) {

  this.enabled = false
  this.mode = undefined
  this.modeName = ''

  // Environment variables ─────────────────────────────────────────────────────

  this.env = {}

  switch (true) {
    case (typeof browser !== 'undefined'):
      this.env.PLATFORM = 'firefox'
      this.env.COMMANDS_EXTENSION_ID = 'commands@alexherbo2.github.com'
      this.env.SHELL_EXTENSION_ID = 'shell@alexherbo2.github.com'
      this.env.DMENU_EXTENSION_ID = 'dmenu@alexherbo2.github.com'
      break
    case (typeof chrome !== 'undefined'):
      this.env.PLATFORM = 'chrome'
      this.env.COMMANDS_EXTENSION_ID = 'cabmgmngameccclicfmcpffnbinnmopc'
      this.env.SHELL_EXTENSION_ID = 'ohgecdnlcckpfnhjepfdcdgcfgebkdgl'
      this.env.DMENU_EXTENSION_ID = 'gonendiemfggilnopogmkafgadobkoeh'
      break
  }

  // Extensions ────────────────────────────────────────────────────────────────

  this.extensions = {}

  // Commands
  this.extensions.commands = {}
  this.extensions.commands.port = chrome.runtime.connect(this.env.COMMANDS_EXTENSION_ID)
  this.extensions.commands.send = (command, ...arguments) => {
    this.extensions.commands.port.postMessage({ command, arguments })
  }

  // Shell
  this.extensions.shell = {}
  this.extensions.shell.port = chrome.runtime.connect(this.env.SHELL_EXTENSION_ID)
  this.extensions.shell.send = (command, ...arguments) => {
    this.extensions.shell.port.postMessage({ command, arguments })
  }

  // dmenu
  this.extensions.dmenu = {}
  this.extensions.dmenu.port = chrome.runtime.connect(this.env.DMENU_EXTENSION_ID)
  this.extensions.dmenu.send = (command, ...arguments) => {
    this.extensions.dmenu.port.postMessage({ command, arguments })
  }

  this.extensions.commands.send('get-platform')
  this.extensions.commands.port.onMessage.addListener((response) => {
    switch (response.id) {
      case 'get-platform':
        switch (response.platform.os) {
          case 'linux':
          case 'openbsd':
            this.env.OPENER = 'xdg-open'
            break
          case 'mac':
            this.env.OPENER = 'open'
            break
        }
        break
    }
  })

  // Status line ───────────────────────────────────────────────────────────────

  this.statusLine = {}
  this.statusLine.update = () => {
    const atoms = []
    // Enabled
    if (this.enabled) {
      atoms.push('🦀')
    } else {
      atoms.push('⏾')
    }
    // Mode
    atoms.push(this.modeName)
    // Selections
    switch (this.selections.length) {
      case 0:
        break
      case 1:
        atoms.push('(1)')
        break
      default:
        atoms.push(`(${this.selections.main + 1}/${this.selections.length})`)
    }
    const statusLine = atoms.join(' ')
    this.modes.modal.notify({ id: 'status-line', message: statusLine })
  }

  // Modes ─────────────────────────────────────────────────────────────────────

  this.modes = {}

  // Modal
  this.modes.modal = new Modal('Modal')
  this.modes.modal.activeElement = () => {
    return this.selections.length
      ? this.selections.mainSelection
      : Modal.getDeepActiveElement()
  }
  this.modes.modal.filter('Gmail', () => location.hostname === 'mail.google.com')
  this.modes.modal.enable('Gmail', 'Video', 'Image', 'Link', 'Text', 'Command')
  this.modes.modal.on('start', () => {
    this.enabled = true
    this.mode = this.modes.modal
    this.modeName = this.modes.modal.context.name
    this.statusLine.update()
  })
  this.modes.modal.on('context-change', (context) => {
    this.modeName = context.name
    this.statusLine.update()
  })

  // Prompt
  this.modes.prompt = new Prompt
  this.modes.prompt.on('open', () => {
    this.mode = this.modes.prompt
    this.modeName = 'Prompt'
    this.modes.modal.unlisten()
    this.statusLine.update()
  })
  this.modes.prompt.on('close', () => this.modes.modal.listen())

  // Pass
  this.modes.pass = new Modal('Pass')
  this.modes.pass.on('start', () => {
    this.enabled = false
    this.mode = this.modes.pass
    this.modeName = 'Pass'
    this.statusLine.update()
  })

  // Hint
  this.env.HINT_SELECTORS = '*'
  this.env.HINT_TEXT_SELECTORS = 'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), textarea, select'
  this.env.HINT_VIDEO_SELECTORS = 'video'

  this.modes.hint = ({ selections, selectors = '*', lock = false } = {}) => {
    const hint = new Hint
    hint.selectors = selectors
    hint.lock = lock
    hint.on('validate', (target) => {
      if (hint.lock) {
        if (selections.includes(target)) {
          selections.remove(target)
        } else {
          selections.add(target)
        }
      } else {
        target.focus()
        if (document.activeElement !== target) {
          selections.add(target)
        }
      }
    })
    hint.on('start', () => {
      this.mode = hint
      this.modeName = 'Hint'
      this.modes.modal.unlisten()
      // Show video controls
      const videos = document.querySelectorAll('video')
      for (const video of videos) {
        this.mouse.hover(video)
      }
      this.statusLine.update()
    })
    hint.on('exit', () => {
      this.mouse.clear()
      this.modes.modal.listen()
    })
    return hint
  }

  // Selections ────────────────────────────────────────────────────────────────

  this.selections = new SelectionList
  this.selections.on('selection-change', (selections) => this.statusLine.update())

  // Tools ─────────────────────────────────────────────────────────────────────

  this.scroll = new Scroll
  this.mouse = new Mouse

  // Commands ──────────────────────────────────────────────────────────────────

  this.commands = {}

  this.commands.notify = (message) => {
    this.modes.modal.notify({ id: 'information', message, duration: 3000 })
  }

  this.commands.click = (selections, modifierKeys = {}) => {
    for (const element of this.commands.getElements(selections)) {
      Mouse.click(element, modifierKeys)
    }
  }

  this.commands.openInNewTab = (selections) => {
    for (const link of this.commands.getElements(selections)) {
      this.extensions.commands.send('new-tab', link.href)
    }
  }

  this.commands.openInNewWindow = (selections) => {
    for (const link of this.commands.getElements(selections)) {
      this.extensions.commands.send('new-window', link.href)
    }
  }

  this.commands.download = (selections) => {
    for (const link of this.commands.getElements(selections)) {
      this.extensions.commands.send('download', link.href)
    }
  }

  this.commands.open = (selections) => {
    for (const link of this.commands.getElements(selections)) {
      this.extensions.shell.send(this.env.OPENER, link.href)
    }
  }

  this.commands.getElements = (selections) => {
    return selections.length
      ? selections.collection
      : [document.activeElement]
  }

  this.commands.yank = (selections, callback, message) => {
    const text = selections.length
      ? selections.map(callback).join('\n')
      : callback(document.activeElement)
    this.commands.copyToClipboard(text, message)
  }

  this.commands.copyToClipboard = (text, message) => {
    Clipboard.copy(text)
    this.commands.notify(message)
  }

  this.commands.mpv = ({ selections, reverse = false } = {}) => {
    const playlist = selections.length
      ? selections.map((link) => link.href)
      : [document.activeElement.href]
    if (reverse) {
      playlist.reverse()
    }
    this.extensions.shell.send('mpv', ...playlist)
  }

  this.commands.mpvResume = () => {
    const media = this.commands.player().media
    media.pause()
    this.extensions.shell.send('mpv', location.href, '-start', media.currentTime.toString())
  }

  this.commands.player = () => {
    const media = this.modes.modal.findParent((element) => element.querySelector('video'))
    Mouse.hover(media)
    return new Player(media)
  }

  this.commands.keep = async (selections, matching, ...attributes) => {
    const mode = matching ? 'Keep matching' : 'Keep not matching'
    const value = await this.modes.prompt.fire(`${mode} (${attributes})`)
    if (value === null) {
      return
    }
    const regex = new RegExp(value)
    selections.filter((selection) => attributes.some((attribute) => regex.test(selection[attribute]) === matching))
  }

  this.commands.select = async (selections) => {
    const value = await this.modes.prompt.fire('Select (querySelectorAll)')
    if (value === null) {
      return
    }
    selections.select(value)
  }

  // Mappings ──────────────────────────────────────────────────────────────────

  // Help
  this.modes.modal.map('Page', ['F1'], () => this.modes.modal.help(), 'Show help')
  this.modes.modal.map('Page', ['Shift', 'F1'], () => window.open('https://github.com/alexherbo2/this/tree/master/doc'), 'Open the documentation in a new tab')

  // Tab search
  this.modes.modal.map('Command', ['KeyQ'], () => this.extensions.dmenu.send('tab-search'), 'Tab search with dmenu')

  // Scroll
  this.modes.modal.map('Command', ['KeyJ'], (event) => this.scroll.down(event.repeat), 'Scroll down')
  this.modes.modal.map('Command', ['KeyK'], (event) => this.scroll.up(event.repeat), 'Scroll up')
  this.modes.modal.map('Command', ['KeyL'], (event) => this.scroll.right(event.repeat), 'Scroll right')
  this.modes.modal.map('Command', ['KeyH'], (event) => this.scroll.left(event.repeat), 'Scroll left')

  // Scroll faster
  this.modes.modal.map('Command', ['Shift', 'KeyJ'], () => this.scroll.pageDown(), 'Scroll page down')
  this.modes.modal.map('Command', ['Shift', 'KeyK'], () => this.scroll.pageUp(), 'Scroll page up')
  this.modes.modal.map('Command', ['KeyG'], () => this.scroll.top(), 'Scroll to the top of the page')
  this.modes.modal.map('Command', ['Shift', 'KeyG'], () => this.scroll.bottom(), 'Scroll to the bottom of the page')

  // Navigation
  this.modes.modal.map('Command', ['Shift', 'KeyH'], () => history.back(), 'Go back in history')
  this.modes.modal.map('Command', ['Shift', 'KeyL'], () => history.forward(), 'Go forward in history')
  this.modes.modal.map('Command', ['KeyU'], () => location.assign('..'), 'Go up in hierarchy')
  this.modes.modal.map('Command', ['Shift', 'KeyU'], () => location.assign('/'), 'Go to the home page')
  this.modes.modal.map('Command', ['Alt', 'KeyU'], () => location.assign('.'), 'Remove any URL parameter')

  // Zoom
  this.modes.modal.map('Command', ['Shift', 'Equal'], () => this.extensions.commands.send('zoom-in'), 'Zoom in')
  this.modes.modal.map('Command', ['Minus'], () => this.extensions.commands.send('zoom-out'), 'Zoom out')
  this.modes.modal.map('Command', ['Equal'], () => this.extensions.commands.send('zoom-reset'), 'Reset to default zoom level')

  // Create tabs
  this.modes.modal.map('Command', ['KeyT'], () => this.extensions.commands.send('new-tab'), 'New tab')
  this.modes.modal.map('Command', ['Shift', 'KeyT'], () => this.extensions.commands.send('restore-tab'), 'Restore tab')
  this.modes.modal.map('Command', ['KeyB'], () => this.extensions.commands.send('duplicate-tab'), 'Duplicate tab')

  // Create windows
  this.modes.modal.map('Command', ['KeyN'], () => this.extensions.commands.send('new-window'), 'New window')
  this.modes.modal.map('Command', ['Shift', 'KeyN'], () => this.extensions.commands.send('new-incognito-window'), 'New incognito window')

  // Close tabs
  this.modes.modal.map('Command', ['KeyX'], () => this.extensions.commands.send('close-tab'), 'Close tab')
  this.modes.modal.map('Command', ['Shift', 'KeyX'], () => this.extensions.commands.send('close-other-tabs'), 'Close other tabs')
  this.modes.modal.map('Command', ['Alt', 'KeyX'], () => this.extensions.commands.send('close-right-tabs'), 'Close tabs to the right')

  // Refresh tabs
  this.modes.modal.map('Command', ['KeyR'], () => location.reload(), 'Reload the page')
  this.modes.modal.map('Command', ['Shift', 'KeyR'], () => location.reload(true), 'Reload the page, ignoring cached content')
  this.modes.modal.map('Command', ['Alt', 'KeyR'], () => this.extensions.commands.send('reload-all-tabs'), 'Reload all tabs')

  // Switch tabs
  this.modes.modal.map('Command', ['Alt', 'KeyL'], () => this.extensions.commands.send('next-tab'), 'Next tab')
  this.modes.modal.map('Command', ['Alt', 'KeyH'], () => this.extensions.commands.send('previous-tab'), 'Previous tab')
  this.modes.modal.map('Command', ['Digit1'], () => this.extensions.commands.send('first-tab'), 'First tab')
  this.modes.modal.map('Command', ['Digit0'], () => this.extensions.commands.send('last-tab'), 'Last tab')

  // Move tabs
  this.modes.modal.map('Command', ['Alt', 'Shift', 'KeyL'], () => this.extensions.commands.send('move-tab-right'), 'Move tab right')
  this.modes.modal.map('Command', ['Alt', 'Shift', 'KeyH'], () => this.extensions.commands.send('move-tab-left'), 'Move tab left')
  this.modes.modal.map('Command', ['Alt', 'Digit1'], () => this.extensions.commands.send('move-tab-first'), 'Move tab first')
  this.modes.modal.map('Command', ['Alt', 'Digit0'], () => this.extensions.commands.send('move-tab-last'), 'Move tab last')

  // Detach tabs
  this.modes.modal.map('Command', ['KeyD'], () => this.extensions.commands.send('detach-tab'), 'Detach tab')
  this.modes.modal.map('Command', ['Shift', 'KeyD'], () => this.extensions.commands.send('attach-tab'), 'Attach tab')

  // Discard tabs
  this.modes.modal.map('Command', ['Shift', 'Escape'], () => this.extensions.commands.send('discard-tab'), 'Discard tab')

  // Mute tabs
  this.modes.modal.map('Command', ['Alt', 'KeyM'], () => this.extensions.commands.send('mute-tab'), 'Mute tab')
  this.modes.modal.map('Command', ['Alt', 'Shift', 'KeyM'], () => this.extensions.commands.send('mute-all-tabs'), 'Mute all tabs')

  // Pin tabs
  this.modes.modal.map('Command', ['Alt', 'KeyP'], () => this.extensions.commands.send('pin-tab'), 'Pin tab')

  // Link hints
  this.modes.modal.map('Command', ['KeyF'], () => this.modes.hint({ selections: this.selections, selectors: this.env.HINT_SELECTORS }).start(), 'Focus link')
  this.modes.modal.map('Command', ['Shift', 'KeyF'], () => this.modes.hint({ selections: this.selections, selectors: this.env.HINT_SELECTORS, lock: true }).start(), 'Select multiple links')
  this.modes.modal.map('Command', ['KeyI'], () => this.modes.hint({ selectors: this.env.HINT_TEXT_SELECTORS }).start(), 'Focus input')
  this.modes.modal.map('Command', ['KeyV'], () => this.modes.hint({ selectors: this.env.HINT_VIDEO_SELECTORS }).start(), 'Focus video')

  // Open links
  this.modes.modal.map('Command', ['Enter'], () => this.commands.click(this.selections), 'Open selection')
  this.modes.modal.map('Link', ['Enter'], () => this.commands.click(this.selections), 'Open link')
  this.modes.modal.map('Link', ['Control', 'Enter'], () => this.commands.openInNewTab(this.selections), 'Open link in new tab')
  this.modes.modal.map('Link', ['Shift', 'Enter'], () => this.commands.openInNewWindow(this.selections), 'Open link in new window')
  this.modes.modal.map('Link', ['Alt', 'Enter'], () => this.commands.download(this.selections), 'Download link')
  this.modes.modal.map('Link', ['Alt', 'Shift', 'Enter'], () => this.commands.open(this.selections), 'Open link in the associated application')

  // Selection manipulation
  this.modes.modal.map('Command', ['KeyS'], () => this.selections.add(document.activeElement), 'Select active element')
  this.modes.modal.map('Command', ['Shift', 'KeyS'], () => this.commands.select(this.selections), 'Select elements that match the specified group of selectors')
  this.modes.modal.map('Command', ['Shift', 'Digit5'], () => this.selections.set([document.documentElement]), 'Select document')
  this.modes.modal.map('Command', ['Shift', 'Digit0'], () => this.selections.next(), 'Focus next selection')
  this.modes.modal.map('Command', ['Shift', 'Digit9'], () => this.selections.previous(), 'Focus previous selection')
  this.modes.modal.map('Command', ['Space'], () => this.selections.clear(), 'Clear selections')
  this.modes.modal.map('Command', ['Control', 'Space'], () => this.selections.focus(), 'Focus main selection')
  this.modes.modal.map('Command', ['Alt', 'Space'], () => this.selections.remove(), 'Remove main selection')
  this.modes.modal.map('Command', ['Alt', 'KeyA'], () => this.selections.parent(), 'Select parent elements')
  this.modes.modal.map('Command', ['Alt', 'KeyI'], () => this.selections.children(), 'Select child elements')
  this.modes.modal.map('Command', ['Alt', 'Shift', 'KeyI'], () => this.selections.select('a'), 'Select links')
  this.modes.modal.map('Command', ['Alt', 'Shift', 'Digit0'], () => this.selections.nextSibling(), 'Select next sibling elements')
  this.modes.modal.map('Command', ['Alt', 'Shift', 'Digit9'], () => this.selections.previousSibling(), 'Select previous sibling elements')
  this.modes.modal.map('Command', ['BracketLeft'], () => this.selections.firstChild(), 'Select first child elements')
  this.modes.modal.map('Command', ['BracketRight'], () => this.selections.lastChild(), 'Select last child elements')
  this.modes.modal.map('Command', ['Alt', 'KeyK'], () => this.commands.keep(this.selections, true, 'textContent'), 'Keep selections that match the given RegExp')
  this.modes.modal.map('Command', ['Alt', 'Shift', 'KeyK'], () => this.commands.keep(this.selections, true, 'href'), 'Keep links that match the given RegExp')
  this.modes.modal.map('Command', ['Alt', 'KeyJ'], () => this.commands.keep(this.selections, false, 'textContent'), 'Clear selections that match the given RegExp')
  this.modes.modal.map('Command', ['Alt', 'Shift', 'KeyJ'], () => this.commands.keep(this.selections, false, 'href'), 'Clear links that match the given RegExp')

  // Phantom selections
  this.modes.modal.map('Command', ['Shift', 'KeyZ'], () => this.selections.save(), 'Save selections')
  this.modes.modal.map('Command', ['KeyZ'], () => this.selections.restore(), 'Restore selections')

  // Unfocus
  this.modes.modal.map('Page', ['Escape'], () => document.activeElement.blur(), 'Unfocus active element')

  // Pass keys
  this.modes.modal.map('Page', ['Alt', 'Escape'], this.modes.pass, 'Pass all keys to the page')
  this.modes.pass.map('Page', ['Alt', 'Escape'], this.modes.modal, 'Stop passing keys to the page')

  // Clipboard
  this.modes.modal.map('Command', ['KeyY'], () => this.commands.copyToClipboard(location.href, 'Page address copied'), 'Copy page address')
  this.modes.modal.map('Command', ['Alt', 'KeyY'], () => this.commands.copyToClipboard(document.title, 'Page title copied'), 'Copy page title')
  this.modes.modal.map('Command', ['Shift', 'KeyY'], () => this.commands.copyToClipboard(`[${document.title}](${location.href})`, 'Page address and title copied'), 'Copy page address and title')
  this.modes.modal.map('Link', ['KeyY'], () => this.commands.yank(this.selections, (selection) => selection.href, 'Link address copied'), 'Copy link address')
  this.modes.modal.map('Link', ['Alt', 'KeyY'], () => this.commands.yank(this.selections, (selection) => selection.textContent, 'Link text copied'), 'Copy link text')
  this.modes.modal.map('Link', ['Shift', 'KeyY'], () => this.commands.yank(this.selections, (selection) => `[${selection.textContent}](${selection.href})`, 'Link address and text copied'), 'Copy link address and text')
  this.modes.modal.map('Image', ['KeyY'], () => this.commands.yank(this.selections, (selection) => selection.src, 'Image address copied'), 'Copy image address')
  this.modes.modal.map('Image', ['Alt', 'KeyY'], () => this.commands.yank(this.selections, (selection) => selection.alt, 'Image description copied'), 'Copy image description')
  this.modes.modal.map('Image', ['Shift', 'KeyY'], () => this.commands.yank(this.selections, (selection) => `[${selection.alt}](${selection.src})`, 'Image address and description copied'), 'Copy image address and description')

  // Player
  this.modes.modal.map('Video', ['Space'], () => this.commands.player().pause(), 'Pause video')
  this.modes.modal.map('Video', ['KeyM'], () => this.commands.player().mute(), 'Mute video')
  this.modes.modal.map('Video', ['KeyL'], () => this.commands.player().seekRelative(5), 'Seek forward 5 seconds')
  this.modes.modal.map('Video', ['KeyH'], () => this.commands.player().seekRelative(-5), 'Seek backward 5 seconds')
  this.modes.modal.map('Video', ['KeyG'], () => this.commands.player().seekAbsolutePercent(0), 'Seek to the beginning')
  this.modes.modal.map('Video', ['Shift', 'KeyG'], () => this.commands.player().seekAbsolutePercent(1), 'Seek to the end')
  this.modes.modal.map('Video', ['KeyK'], () => this.commands.player().increaseVolume(0.1), 'Increase volume')
  this.modes.modal.map('Video', ['KeyJ'], () => this.commands.player().decreaseVolume(0.1), 'Decrease volume')
  this.modes.modal.map('Video', ['KeyF'], () => this.commands.player().fullscreen(), 'Toggle full-screen mode')
  this.modes.modal.map('Video', ['KeyP'], () => this.commands.player().pictureInPicture(), 'Toggle picture-in-picture mode')

  // mpv
  this.modes.modal.map('Video', ['Enter'], () => this.commands.mpvResume(), 'Play with mpv')
  this.modes.modal.map('Link', ['KeyM'], () => this.commands.mpv({ selections: this.selections }), 'Play with mpv')
  this.modes.modal.map('Link', ['Alt', 'KeyM'], () => this.commands.mpv({ selections: this.selections, reverse: true }), 'Play with mpv in reverse order')

  // Initialization ────────────────────────────────────────────────────────────

  if (dormant) {
    this.modes.pass.listen()
  } else {
    this.modes.modal.listen()
  }
}
