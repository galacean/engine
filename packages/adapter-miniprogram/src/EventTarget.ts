import Event from './Event';

const _events = new WeakMap();

export default class EventTarget {
  constructor() {
    _events.set(this, {})
  }

  addEventListener(type, listener, options: any = {}) {
    let events = _events.get(this);

    if (!events) {
      events = {}
    }
    if (!events[type]) {
      events[type] = []
    }
    events[type].push(listener)
    _events.set(this, events)

    if (options.capture) {
      // console.warn('EventTarget.addEventListener: options.capture is not implemented.')
    }
    if (options.once) {
      // console.warn('EventTarget.addEventListener: options.once is not implemented.')
    }
    if (options.passive) {
      // console.warn('EventTarget.addEventListener: options.passive is not implemented.')
    }
  }

  removeEventListener(type, listener, options = {}) {
    const events = _events.get(this)

    if (events) {
      const listeners = events[type]

      if (listeners && listeners.length > 0) {
        for (let i = listeners.length; i--; i > 0) {
          if (listeners[i] === listener) {
            listeners.splice(i, 1)
            break
          }
        }
      }
    }
  }

  dispatchEvent(event: Event) {
    const listeners = _events.get(this)[event.type]

    if (listeners) {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i](event)
      }
    }
  }
}
