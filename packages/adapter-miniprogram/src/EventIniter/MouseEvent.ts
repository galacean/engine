import Event from '../Event'
import document from "../document";

class MouseEvent extends Event {
  constructor(type) {
    super(type)
  }
}

function eventHandlerFactory(type) {
  return (rawEvent) => {
    rawEvent.type = type;
    document.dispatchEvent(rawEvent)
  }
}

let dispatchMouseDown = eventHandlerFactory('mousedown');
let dispatchMouseMove = eventHandlerFactory('mousemove');
let dispatchMouseUp = eventHandlerFactory('mouseup');
export {
  dispatchMouseDown,
  dispatchMouseMove,
  dispatchMouseUp
}
