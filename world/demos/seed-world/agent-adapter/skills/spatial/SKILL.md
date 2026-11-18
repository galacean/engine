---
name: spatial
description: 解析相对位置、按地形条件搜索地点、检查落点或传送玩家时使用。
---

# 空间与落点

## 选择流程

按已有信息选择：

- 已知世界坐标：在编辑接口的 `target` 中使用 position 锚点和 `at` 关系。
- 截图中的位置：用 `pick` 指向目标像素，把返回的 `estimatedPosition` 作为拍摄时的表面位置。
- 相对目标：用 `spatial.resolve` 解析空间关系，直接使用返回的 Target。
- 已知坐标的条件检查：用户或编辑契约要求检查地形时，用 `spatial.check`。
- 按地形条件搜索：用 `spatial.search` 查找满足用户条件的候选。

## 位置与放置

放置规则写在 `target.placement` 中，遵循编辑接口的契约。

贴地放置时，给出目标水平位置并写 `snapTo: "terrain"`，编辑接口负责计算最终地形高度。

截图位置可能落在草或其他可见表面上，它不能证明当前地面高度或放置条件。地形条件未知且必须满足时，用 `spatial.check`。它一次最多接受 32 个位置，逐个返回 `matches` 和 `failedConstraints`。

选择位置和确定可编辑对象是两件事。选择位置用上面的流程。编辑对象时，按 [world-objects](skills/world-objects/SKILL.md) 确定身份和归属。

## 搜索与导航

`spatial.search` 的 `nearest` 按距离锚点排序候选，不会采样锚点本身的位置。

有限搜索返回 `no_match` 表示这次搜索已完成，不能证明世界上所有位置都不合适。再次搜索需要变更要求或有新证据。检查或搜索结束后，保留用户的条件。

`spatial.teleport` 把玩家移动到空间目标。`subjectView` 通过世界参数为已发布的主体取景，用法见本 Skill 的组件知识。朝向 0 面向 -Z，朝向 90 面向 +X。

`viewer` 锚点使用提交当前指令时的玩家位姿。这个参照在多次 execute、玩家移动和传送期间保持不变。处理新的补充指令时，参照更新为该输入的位姿。没有生效的指令时，锚点使用实时位姿。

## 读取实时位姿

`await tools.spatial.viewer()` 读取已发布的实时相机位姿：

- `position` 是眼睛位置，单位为米。
- `forward` 是相机方向。
- `headingDegrees`：0 为 -Z，90 为 +X，180 为 +Z，270 为 -X。
- `pitchDegrees`：向上为正。
- `nearestHorizontalAxis` 用于描述方向。

角度或轴为 null 表示未定义，不是 0。它不会读取未提交的传送目标。验证传送时，在传送的 execute 提交后，再用下一次 execute 调用它。

检查当前地面时，把 `position[0]` 和 `position[2]` 传给 `spatial.check`。不要用冻结的 viewer 锚点读取实时位置。

实时位姿是相对世界原点的眼睛绝对坐标。Y 坐标既不是离地高度，也不是地面海拔。它也不能确定地理区域。回答位置和方向问题时，报告坐标和返回的角度或轴。关于地面的其他说法要另外测量。地理名称需要已定义的地图参照。

## 水的判断

- `surface.water` 表示采样点是否被水覆盖。回答“脚下有没有水”时，只看这个值。
- `riverDistanceMetres` 沿用旧名称，实际是到内陆水体的距离，包括河流、湖泊和池塘，不包括海洋。范围见 `riverDistanceScope`。
- `nearestWaterDistanceMetres` 为 null 表示没有测量到任何类型水体的距离，不表示没有水，也不表示距离无限。河流距离不能替代它。
- `moisture` 是归一化的世界地表字段，不是农场土壤含水率，也不能证明有水覆盖。

离散采样不能证明周围整片区域的覆盖情况。只报告实际测量过的水体类别的距离。

## 接口索引

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->

<!-- API_INDEX: generated from executable contracts at load time. -->
