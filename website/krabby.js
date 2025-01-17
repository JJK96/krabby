function Krabby({ dormant = true } = {}) {

  this.enabled = false
  this.mode = undefined
  this.modeName = ''
  this.env = {}

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
  this.modes.modal.enable('Video', 'Image', 'Link', 'Text', 'Command')
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

  // Reload pages
  this.modes.modal.map('Command', ['KeyR'], () => location.reload(), 'Reload the page')
  this.modes.modal.map('Command', ['Shift', 'KeyR'], () => location.reload(true), 'Reload the page, ignoring cached content')

  // Link hints
  this.modes.modal.map('Command', ['KeyF'], () => this.modes.hint({ selections: this.selections, selectors: this.env.HINT_SELECTORS }).start(), 'Focus link')
  this.modes.modal.map('Command', ['Shift', 'KeyF'], () => this.modes.hint({ selections: this.selections, selectors: this.env.HINT_SELECTORS, lock: true }).start(), 'Select multiple links')
  this.modes.modal.map('Command', ['KeyI'], () => this.modes.hint({ selectors: this.env.HINT_TEXT_SELECTORS }).start(), 'Focus input')
  this.modes.modal.map('Command', ['KeyV'], () => this.modes.hint({ selectors: this.env.HINT_VIDEO_SELECTORS }).start(), 'Focus video')

  // Open links
  this.modes.modal.map('Command', ['Enter'], () => this.commands.click(this.selections), 'Open selection')
  this.modes.modal.map('Link', ['Enter'], () => this.commands.click(this.selections), 'Open link')
  this.modes.modal.map('Link', ['Control', 'Enter'], () => this.commands.click(this.selections, { ctrlKey: true }), 'Open link in new tab')
  this.modes.modal.map('Link', ['Shift', 'Enter'], () => this.commands.click(this.selections, { shiftKey: true }), 'Open link in new window')
  this.modes.modal.map('Link', ['Alt', 'Enter'], () => this.commands.click(this.selections, { altKey: true }), 'Download link')

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

  // Initialization ────────────────────────────────────────────────────────────

  if (dormant) {
    this.modes.pass.listen()
  } else {
    this.modes.modal.listen()
  }
}
