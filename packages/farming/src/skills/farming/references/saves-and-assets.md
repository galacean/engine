# 资产与存档

创建、读取、删除资产，查询引用，以及修改组件引用时，读 `declare/editor/native/api.d.ts` 获取普通 Editor API 声明。这里使用 execute 的 `editor.asset`。Script 声明不用于这些编辑操作。

## 组件引用

FarmingSystem 的 Scene 属性 `catalog`、`rules`、`state` 都是资产引用（`{$ref:"虚拟路径"}`）。

- 目录资产包含作物、种子和植物定义。植物 atlasUrl 使用项目中的贴图虚拟路径。
- 规则资产包含土壤、环境和动作参数。
- state 是系统独立管理的存档。

先用通用的 `editor.component.read({scene,id})` 查看当前引用，再 read 对应的虚拟路径。用 `editor.asset.references({path})` 查询引用者。还被组件或目录引用的资产不能删除。

默认资产是 `World/Farming/Catalog.json`、`World/Farming/Rules.json`、`World/Farming.json`。这些只是预置值，实际使用以组件读回的引用为准。共享的目录和规则不用为每个农场复制一份。游戏状态只通过系统业务命令保存。普通 Scene 编辑不会覆盖最新存档。

组件切换引用后，宿主重新绑定相应的资源和仓储。资源配置必须满足种植规则和存档校验，不能通过改 JSON 绕过作物操作。

## 系统数量

每个 Scene 只放一个 FarmingSystem，由它管理多个农场区域。停用的组件仍占据这个 Scene 的系统身份。重复组件、缺失的资产引用或错误的资产类型会在保存前报错，不会替换已有农场。

## 新建与切换存档

新建独立存档使用普通的资产创建：

```js
return await editor.asset.create({
  path: "Saves/MyFarm.json",
  type: "SeedWorldFarming",
  content: JSON.stringify({version: 1, farms: {}})
});
```

空存档由 FarmingSystem 初始化。切换时，用 `component.update` 把 `state` 指向新的虚拟路径。原存档保留，直到明确删除。不要手工填充作物、库存或回执。

目录和规则都是引擎原生 JSONAsset 文件，内容的 kind 分别必须是 catalog 和 rules，版本必须相同，种子必须引用目录中存在的作物。非法的植物定义、土壤、环境、动作参数和模拟参数都会被拒绝。

修改目录或规则内容、切换 state 引用时，运行激活会检查已有存档与候选配置的兼容性，包括作物定义、模拟规则签名和已有网格的扩散稳定性。不兼容会报告激活失败；作者接受、运行激活与落盘是独立结果，不能把编辑已接受当作农场已就绪。

- 需要新的模拟规则时，在同一次 execute 中创建空存档、修改规则并切换 state 引用。旧存档保留。
- 远端状态文件要先 read，内容才能用于校验。
- 空存档的实际场地和网格由初始化流程检查。用 getDiagnostics 确认区域就绪后，再执行业务命令。

新存档初始化使用当前的目录和规则。仓储定义与规划时不同时，会在原农场网格和搜索范围内重新检查初始容器，并保留操作通道。是否预置容器仍由 initialContainers 配置决定。找不到合法位置时，通过 getDiagnostics 报告失败，不迁移农场，也不修改已有存档。已有存档的容器按其兼容规则的完整占地恢复，保存的位置保持不变。

## 删除系统

删除系统不会自动删除存档。需要清理存档时，按顺序操作：

1. 提交并完成组件移除，或切换 state 引用。
2. 保存并完成受控关闭，然后重新打开项目会话。
3. 确认没有组件再次持有旧存档，查询资产引用，删除没有引用的旧 state 文件并保存。

存档采用 project 保留策略：即使旧仓储已释放，旧路径在当前会话内仍受保护，删除会被拒绝。不能在同一会话或同一草稿里先移除组件再删除存档以绕过保护。存档内容只由 FarmingSystem 业务方法写入。

## 诊断与能力的范围

`getDiagnostics().value.farms` 是带 `phase` 和版本的记录数组。`published` 描述当前发布，`candidate` 描述候选尝试。候选 pending 不会覆盖发布 ready，要分别解释。

诊断的 `presentation` 是视觉资源状态。`capabilities({farmId}).value.interactionHostBound` 是交互宿主绑定，`targetQueryAvailable` 是目标查询能力。`presentation` 布尔字段只是交互宿主的别名。省略 farmId 时返回 `scope.kind=system`，不能用系统级的 false 推断区域坏了。

`getDiagnostics.coverage` 只检查发布就绪的 placement、access、runtime、presentation。`ready=true` 不能证明农业全部正常。同一返回值的 `agronomy` 提供地块、作物、土壤和库存的当前摘要。先读这份摘要，有具体 finding 时再查对应地块的详情。外观和未来状态不在检查范围内。

浇水回执的 `effectSummary` 区分即时灌水和结算。`distributed=0` 不排除后续的土壤扩散。之后的含水率以读回为准，不能没有证据就归因于蒸发。

## 组件作者微调

`FarmingSystem.cropGrowthMultiplier` 为 `null`（继承共享规则，默认 1）或 0–100 的有限数；0 只暂停作物生长，不加速土壤、水分或昼夜。通过 `editor.component.update` 修改属性，与现有农场面板共用 Source、事务和历史，保存重开后保留。这将原来的会话内调试旋钮改为项目持久化属性，不写进玩家快照。直接给运行中的原生组件赋值也由组件排入各区域服务队列，不依赖 Seed World Host。

## 资源同步

目录和规则走原生 JSONLoader，不注册专用扩展名。图集引用使用原生 `{ "$ref": "World/Farming/Textures/wheat.ktx2" }`；领域计算读取只读路径视图。

农场运行时使用公共 RuntimeAssetChanges 记录读取基线，并沿 Prefab、AnimatorController、catalog/rules 的依赖闭包判断失效；资源路径不限定在 Farming 目录。相关资源变化会退役并重建整个 PlanningFarmingRuntime，从项目仓储保留并恢复进度，其他系统保持原状；仅惰性读取或编辑无关资产不会触发重建。
