---
order: 9
title: 时间
type: 核心
label: Core
---

`Time` 包含了引擎时间相关的信息：

## 属性

| 名称                                                   | 释义                                                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [timeScale](/apis/core/#Time-timeScale)                 | 时间的缩放                                                                                                                                               |
| [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime)   | 最大间隔，帧率过低或卡顿时                                                                                                                               |
| [frameCount](/apis/core/#Time-frameCount)               | 引擎启动后累计的帧数                                                                                                                                     |
| [deltaTime](/apis/core/#Time-deltaTime)                 | 上一帧距离当帧的增量时间，以秒为单位，不会超过 [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime) \* [timeScale](/apis/core/#Time-timeScale)            |
| [actualDeltaTime](/apis/core/#Time-actualDeltaTime)     | 上一帧距离当帧的实际增量时间，以秒为单位，并且忽略了 [timeScale](/apis/core/#Time-timeScale) 和 [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime) 影响 |
| [elapsedTime](/apis/core/#Time-elapsedTime)             | 引擎启动后累计经过的时间，以秒为单位                                                                                                                     |
| [actualElapsedTime](/apis/core/#Time-actualElapsedTime) | 引擎启动后累计经过的时间，以秒为单位                                                                                                                     |
