import { loadText } from "./loadText";

export function loadJSON(file, callback, timeout?: number) {
  let timer;

  if (timeout) {
    timer = setTimeout(() => {
      callback(new Error("JSON load timeout " + file), null);
    }, timeout);
  }

  loadText(file, function(err, data) {
    if (timer) {
      clearTimeout(timer);
    }

    if (err) {
      callback(err, null);
    } else {
      let json = null;
      try {
        json = JSON.parse(data);
      } catch (e) {
        return callback(e.toString(), null);
      }
      callback(null, json);
    }
  });
}
