export function loadBinary(url, callback) {
  const request = new XMLHttpRequest();
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
