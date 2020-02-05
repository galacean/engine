let engine = null;

Page({
  onUnload() {
    if (engine && engine.shutdown) {
      engine.shutdown();
    }
  },
  onOasisLoad(O3, canvas) {

    <%= code %>

  }
});
