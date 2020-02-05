import { loadText } from "./loadText";

export function loadJSON(file, callback) {
  loadText(file, function(err, data) {
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
