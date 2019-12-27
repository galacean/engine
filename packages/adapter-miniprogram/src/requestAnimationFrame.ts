import { getCanvas } from "./register";

let lastTime: any = 0;
let id: any = 0;

function hack(cb) {
  let now = Date.now();

  let nextTime = Math.max(lastTime + 23, now);

  id = setTimeout(() => {
    cb((lastTime = nextTime));
  }, nextTime - now);

  return id;
}

function requestAnimationFrame(cb) {
  let canvas = getCanvas();
  if (canvas.requestAnimationFrame) {
    return canvas.requestAnimationFrame(cb);
  } else {
    return hack(cb);
  }
}

function cancelAnimationFrame(id) {
  let canvas = getCanvas();
  if (canvas.cancelAnimationFrame) {
    return canvas.cancelAnimationFrame(id);
  } else {
    return clearTimeout(id);
  }
}

export { requestAnimationFrame, cancelAnimationFrame };
