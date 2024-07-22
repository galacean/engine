---
order: 0
title: 后处理总览
type: 图形
group: 后处理
label: Graphics/PostProcess
---

后处理系统可以对场景渲染的结果进行“加工”。

关闭后处理：

![](https://gw.alipayobjects.com/zos/OasisHub/3a50ed18-c2d4-4b33-a4e6-af79f2c273f8/2024-07-18%25252018.08.30.gif)

开启后处理：

![](https://gw.alipayobjects.com/zos/OasisHub/4bd5f985-1b82-4aca-b6fa-fd521aab8f57/2024-07-18%25252018.15.30.gif)

## 使用后处理

### 1.后处理配置

后处理配置统一放在 scene 面板下，为了防止性能浪费，默认**关闭总开关**，用户只需要打开总开关，就能激活所有后处理效果：

<img src="https://gw.alipayobjects.com/zos/OasisHub/50f6a2aa-0463-4b66-b54e-edff71187077/image-20240718193530098.png" alt="image-20240718193530098" style="zoom:50%;" />

> 具体的后处理效果配置，请参考 [后处理效果列表](/docs/graphics-postProcess-effects)

截止 1.3 版本，引擎没有暴露公共 API（因为支持后处理拓展后，API 可能会产生变动），我们建议用户在编辑器进行后处理操作。如果想使用内部实验接口，可以调用：

```typescript
// 获取后处理管理器
// @ts-ignore
const postProcessManager = scene._postProcessManager;
// 获取 BloomEffect
const bloomEffect = postProcessManager._bloomEffect as BloomEffect;
// 获取 TonemappingEffect
const tonemappingEffect = postProcessManager._tonemappingEffect as TonemappingEffect;

// 激活总开关
postProcessManager.isActive = true;

// 调整 BloomEffect 属性
bloomEffect.enabled = true;
bloomEffect.downScale = BloomDownScaleMode.Half;
bloomEffect.threshold = 0.9;
bloomEffect.scatter = 0.7;
bloomEffect.intensity = 1;
bloomEffect.tint.set(1, 1, 1, 1);

// 调整 TonemappingEffect 属性
tonemappingEffect.enabled = true;
tonemappingEffect.mode = TonemappingMode.ACES;
```

### 2.相机开关

相机组件拥有开关，能够决定是否开启后处理，以及是否开启 HDR、 MSAA 等后处理相关属性。（相机虽然默认开启后处理，但是需要打开后处理配置总开关才能生效，这是为了更加灵活地控制多相机去应用后处理配置）

> 相机更多配置参考 [相机组件](/docs/graphics-camera-component)

<img src="https://gw.alipayobjects.com/zos/OasisHub/3232935d-a765-4da4-b08e-021aac61458e/image-20240718210947199.png" alt="image-20240718210947199" style="zoom:50%;" />

### 3.视图区开关

除了相机预览区，视图区也能看到后处理效果。视图区的相机是独立的，但是也和相机组件一样拥有后处理等开关（同上，也要注意后处理配置中的开关）；视图区的开关只会影响视图窗口，并不会影响项目导出的真实效果：

<img src="https://gw.alipayobjects.com/zos/OasisHub/f9f13d02-931f-4638-af91-4a007007c99f/image-20240718193359413.png" alt="image-20240718193359413" style="zoom:50%;" />

## 移动端推荐配置

一般来说，下图红框内的一些后处理配置会影响到性能：

 <img src="https://gw.alipayobjects.com/zos/OasisHub/7e5e272c-fc1e-45cd-92b0-a687c58826c7/image-20240719104328198.png" alt="image-20240719104328198" style="zoom:50%;" />

以及相机的部分配置：

<img src="https://gw.alipayobjects.com/zos/OasisHub/5d96cd31-2e12-43eb-8493-f8751e40eb82/image-20240719112101652.png" alt="image-20240719112101652" style="zoom:50%;" />

- 关于相机中 `HDR` 开关，如果场景中绝大部分像素颜色没有超过 1（比如没有使用 HDR 贴图）, 尽量别开启 HDR，开启后引擎会先渲染到 `R11G11B10_UFloat` 格式的 RenderTarget 中，再渲染到屏幕上，有性能开销。
- 关于相机中的 `MSAA` 选项，仅当开启了后处理，且对锯齿表现要求严格的情况下，才建议调整这个值，值越大，性能开销越大。
- 泛光特效中，`Down Scale` 默认为 `Half`，即初始降采样的分辨率为画布的一半，如果对精度要求没那么高，可以切换为 `Quarter`，节省为画布的 1/4。
- 色调映射特效中， 虽然 `ACES` 拥有更好的色彩对比度和饱和度，但是计算比较复杂，在低端机型可能导致降帧严重，可以使用 `Neutral` 替代方案。
