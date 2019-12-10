let cacheCanvas = document.createElement("canvas");
cacheCanvas.toBlob =
  cacheCanvas.toBlob ||
  //  low performance polyfill based on toDataURL (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
  function(callback, mimeType, quality) {
    const binStr = atob(this.toDataURL(mimeType, quality).split(",")[1]),
      len = binStr.length,
      arr = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      arr[i] = binStr.charCodeAt(i);
    }
    callback(new Blob([arr]));
  };

export default cacheCanvas;
