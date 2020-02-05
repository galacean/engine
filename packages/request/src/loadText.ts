export function loadText(url, callback) {
  const request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.onreadystatechange = function(e) {
    if (request.readyState === 4) {
      if (request.status === 200) {
        if (callback) {
          callback(null, request.responseText);
        }
      } else {
        callback("loadText error: " + request.statusText, null);
      }
    }
  };

  request.send(null);
}
