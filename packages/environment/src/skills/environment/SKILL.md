---
name: environment
description: 查询或修改时间、季节、天气、风、云雾、光照等环境状态时使用。
---

# 时间、季节与天象

## 使用说明

需要时先读取当前时间和季节，再修改。

修改时间或季节用 `time.update`。只调用一次，不需要写循环。`time.get` 返回的 `playing` 为 `false` 时，世界时间不会自行流逝。

需要时先读取天象状态。只修改用户要求的通道：天空颜色、风、雨、雪、雷电、云和雾。本系统仅控制视觉天象，不提供音频或环境音效；若用户同时要求开启雷雨音效，先完成可做的天象修改并如实说明当前不支持音效即可，不要去搜索或手写音频合成脚本。

读写光照（`lighting`）、后处理（`postProcess`）与云降水规划参数（`weather`）使用 `tools.environment.config.get`、`tools.environment.config.update`、`tools.environment.config.reset`。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->

风向是空气吹向的世界水平方向：0° 指向 -Z，+90° 指向 +X，-90° 指向 -X。它不是风吹来的方向，也不是相对风实体的偏移。更新回执返回草稿目标。提交后，`tools.atmosphere.get()` 返回当前实际风向，过渡期间两者可能不同。风速为 0 时，保留的上次风向不表示仍在刮风。
