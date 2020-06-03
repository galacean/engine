let engine = null;

Page({
  onUnload() {
    if (engine && engine.shutdown) {
      engine.shutdown();
    }
  },
  onOasisLoad(o3, canvas) {

    <%= code %>

  }
});
