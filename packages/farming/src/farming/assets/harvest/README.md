# 收获篮子

来源：用户确认的 `Farmlands-Library.blend`，`23 - Harvest Basket Preview`。使用 Blender CLI 执行 `tools/export-harvest.py` 导出；导出不保存或修改源工程。

- `basket.glb` / `basket.prefab` 仅含刚性篮子，原始米制尺寸与 -55° 开口姿态。没有果实、预览相机、HUD 或固定收获序列。
- 三张 1024 像素 KTX2 与水壶共享，模型通过 `KHR_texture_basisu` 引用外部资源。Blender 导出后执行 `node world/gallery/shared/farming/tools/encode-prop-textures.mjs`，压缩参数与再生成流程见 [共享纹理](../prop-textures/README.md)。
- `basket-motion.json` 保留 `Basket_Show`、`Basket_Hold`、`Basket_Receive`、`Basket_Hide` 的 60 FPS 相机局部坐标样本。运行时采样唤出轨迹，收起沿原轨迹反向播放；收起中收获可连续反向唤出。接收时添加 6mm 反馈，竖屏沿用已确认的远移偏移。
- `HarvestBasketPresenter` 以标准 ResourceManager / Prefab 加载篮子，并挂在宿主 Camera。它提供 `prepare/show/hide/receive/update/snapshot/dispose`；宿主驱动实际时间，成功回执才能调用 `receive`。初次资源未就绪时保留回执，加载后完整播放入场。
- `HarvestProduce` 程序化生成 14 种收获代表物（果实、根茎、穗束与种籽袋），使用稳定物体局部坐标的 0→1 消融材质。形态和颜色区分产物，未使用 Blender 果实 GLB；属于程序化代表物，不是原参考模型的逐顶点复制。
- 最多 8 组代表物。满篮替换最旧槽位，保留最新；土豆最多展示 3 颗并错开显现。实际数量来自回执，不被展示上限修改。收起完成清空展示，不修改库存。
- 成功收获或主动 `show` 刷新 60 秒期限；重复回执不刷新。农场加载历史快照不会重新播放历史收获。预览暂停/速度影响预览时钟；农场使用真实帧时间。

预览入口：`demos/farming/animation-preview/?animation=harvest`。混装时间轴为 14.2 秒；生命周期为 68 秒，3 秒收获刷新、63 秒收起。作物选择 / 数量 / 模拟成功收获切换到连续测试；拖动时间轴重新进入确定性演示。测试按钮不改真实库存。

浏览器接口：预览 `window.farmingAnimationPreview.basket`（含模拟 receive），农场 `window.farmingDemo.basket`（show/showForHarvest/hide/snapshot）。农场产物只通过成功 `crop-harvested` 事件添加，锄地清除不触发收获篮子。可被宿主 AI 工具调用；本次未新增特定 LLM 工具注册。


正式接入入口：引擎无关事件绑定从 `shared/farming/api` 导入，Galacean 渲染从 `shared/farming/presentation` 导入。农场案例复用该绑定，场景不再自行解析收获回执。未初始化的 Service 不可绑定；销毁时先解绑，再释放篮子实例。

```ts
import { bindHarvestBasket } from "shared/farming/api";
import { HarvestBasketPresenter } from "shared/farming/presentation";

// service.initialize() 已完成，camera 由宿主提供。
const basket = new HarvestBasketPresenter(camera);
const unbind = bindHarvestBasket(service, basket);
// 宿主每帧调用 basket.update(realDeltaSeconds)。
// UI / AI 可调用 basket.show()、basket.hide()、basket.snapshot()。
// 结束：unbind(); basket.dispose();
```

`show()` 唤出或续期 60 秒，不清空仍停留的产物；`hide()` 收起并在完成后清空展示。两者均不修改库存和农场修订。实际收获须指定目标作物实例，成功保存后的事件由绑定传给篮子：

```ts
const crop = service.getPlot(plotId)?.crop;
if (crop && (await basket.showForHarvest())) {
  const result = await service.executeAction({
    type: "harvest",
    plotId,
    cropInstanceId: crop.instanceId
  });
  // 使用 result.ok / result.error 反馈结果；不要在这里再次调用 basket.receive()。
}
```

`cropInstanceId` 在发起操作时从目标地块取得；若执行前作物已被替换，事务会拒绝旧实例，避免误收获新作物。AI 宿主可暴露这些控件，无需修改通用 System Prompt。

`showForHarvest()` 加载篮子并等待其到达手持位置；已拿出时直接继续，收起中则反向拿出。宿主持续调用 `update()` 推进动画，收起、重置或销毁会取消等待并返回 `false`，加载失败会抛出错误。农场先等待拿出动画，再提交收获事务；成功事件同时触发植株消散和篮内产物显现，两者使用相同的 2 秒时长。土豆多颗略微错开起点，但同时完成。业务 Service 不依赖动画；直接调用 Service 的宿主需自行执行这一步准备。

农场操作入口：左上“篮子 B”按钮或按 B；总览、种子选择或操作忙碌时不响应切换。浏览器 API 继续提供 `window.farmingDemo.basket`。展示的 14 种产物使用共享程序化实现；其他作物宿主可以实现 `HarvestBasketReceiver` 复用同一成功事件绑定。

显式收起：底部快捷栏第 7 格“收起”，点击或按 `7` / 小键盘 `7`。此操作不需要选中土地，独立于第 6 格“还原土地”；总览、种子选择或忙碌时不响应。代码调用 `basket.hide()`，农场浏览器 / AI 宿主调用 `window.farmingDemo.basket.hide()`。重复收起不会唤出篮子；沿当前轨迹播放收起动画，完成后清空篮内展示，仓库库存和农场修订不变。
