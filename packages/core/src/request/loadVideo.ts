export function loadVideo(url, callback, crossOrigin = "anonymous") {
  const video = document.createElement("video");

  let loaded = false;

  video.loop = true;
  video.crossOrigin = crossOrigin;

  video.onerror = () => {
    callback(new Error("Failed to load " + url), null);
  };

  video.addEventListener(
    "canplaythrough",
    () => {
      if (loaded) return;

      loaded = true;
      callback(null, video);
    },
    true
  );

  video.src = url;

  // add load timeout fallback
  setTimeout(function () {
    if (!loaded) {
      callback(new Error("Failed to load " + url));
    }
  }, 10000);
}
