export const updateForE2E = (engine, deltaTime = 100) => {
  engine._vSyncCount = Infinity;
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < 10; ++i) {
    engine.update();
  }
};

export const e2eReady = () => {
  setTimeout(() => {
    const text = document.createElement("div");
    text.className = "cypressReady";
    document.body.appendChild(text);
  }, 1000);
}
