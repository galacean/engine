export function loadText(url, callback, timeout?: number) {
  const request = new XMLHttpRequest();

  if (timeout) {
    request.timeout = timeout;
  }

  request.open("GET", url, true);
  request.onreadystatechange = function (e) {
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
