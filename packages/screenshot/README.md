# o3-screenshot
请注意！截图必须设置 preserveDrawingBuffer:true
```
let cameraProps = {
  canvas: "o3-demo",
  attributes: {
    preserveDrawingBuffer: true
  }
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
```
