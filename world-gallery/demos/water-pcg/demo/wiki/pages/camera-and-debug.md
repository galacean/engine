水体经常需要相机深度纹理和不透明颜色纹理。如果每片水单独修改相机，多水体场景会产生重复拷贝和状态覆盖。

## CameraWaterFeatureBroker

所有可见水体向同一个 Broker 提交请求：

```ts
cameraWaterFeatures.setRequest("main-river", {
  depthTexture: true,
  opaqueTexture: true,
  reflection: "probe",
  caustics: false,
  underwater: false,
  quality: "medium"
});
```

Broker 会：

- 合并所有调用方的深度和颜色需求。
- 选择能够满足所有调用方的最高纹理分辨率。
- 把 CopyDepth 和 CopyColor 各限制为一次。
- 最后一个调用方移除后恢复相机原状态。
- 估算相关 RenderTarget 内存。

水体销毁时应调用 `removeRequest(id)`。相机整体销毁前调用 `destroy()`。

## 浏览器查询探针

P0 Demo 在浏览器暴露只读调试入口：

```js
window.waterPcgP0.querySurface(0, 2, 0);
window.waterPcgP0.worldMetrics;
window.waterPcgP0.bodyMetrics;
window.waterPcgP0.capabilityMatrix;
```

它适合验证某个世界坐标到底命中了哪片水，以及最终高度和速度是多少。不要让业务代码依赖这个浏览器对象。

## River 六阶段调试视图

调试面板按数据生命周期组织，而不是堆一组互不相关的开关：

1. **Authoring**：控制点、Bezier 手柄和输入路径。
2. **Topology**：nodes、reaches、junctions、采样和岸线。
3. **Geometry**：Raw Surface Mesh、Chunk 边界和 Junction Mesh。
4. **Fields**：Base/Local/Final Flow、Query Arrow、Foam、SDF、Atlas、Terrain Corridor 和 Query Grid。
5. **Surface**：Flow Coordinate、Macro Height、Crest、Micro Normal 和 Shore Damping。
6. **Final**：正式材质、泡沫、河床和场景装饰。

先找“最早出错的阶段”。Authoring 已错时，不要在 Final Shader 中补丁式修正。

## River Flow 调试顺序

遇到漂流方向与画面不一致时，按顺序检查：

1. **Base Flow**：河道拓扑是否正确。
2. **Local Flow**：局部 Atlas 是否覆盖当前位置。
3. **Final Flow**：两者混合后是否合理。
4. **Query Arrow**：CPU 查询结果是否和 Final Flow 一致。

如果前三层正确、Query Arrow 错误，应检查 CPU Atlas 解码；如果 Local Flow 就错误，应回到编译或 Atlas 数据。

## 需要持续观察的指标

- WaterWorld 查询 P50/P95。
- 同一点候选水体数。
- 每片水的三角形、绘制、资源字节和上传次数。
- CopyDepth、CopyColor 是否各为 0 或 1。
- 估算 RenderTarget 内存是否随质量档位合理变化。
