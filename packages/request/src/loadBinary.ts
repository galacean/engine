export function loadBinary(url, callback, timeout?: number) {
  const request = new XMLHttpRequest();

  if (timeout) {
    request.timeout = timeout;
  }

  request.open("GET", url, true);
  request.responseType = "arraybuffer";
  request.onreadystatechange = function(e) {
    if (request.readyState === 4) {
      if (request.status === 200) {
        callback(null, request.response);
      } else {
        callback("loadBinary error : " + request.response, null);
      }
    }
  };
  request.send(null);
}
