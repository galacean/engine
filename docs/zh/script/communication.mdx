---
order: 5
title: 事件通信
type: 脚本
label: Script
---

使用 Galacean Engine 开发的项目，通常还需要与外部环境进行通信，比如将项目运行时的信息发送到外部，或从外部环境或许某些配置信息。此时，你可以使用 Galacean Engine 的事件系统来实现此类功能。

## 添加事件

Galacean Engine 提供了 [EventDispatcher](/apis/core/#EventDispatcher) 作为事件类，[Engine](/apis/core/#Engine) 继承自 [EventDispatcher](/apis/core/#EventDispatcher)，因此我们直接在代码中使用 `engine` 来作为内外部通信的媒介。

**使用 `engine.on` 添加事件**

```ts
import { Script } from "@galacean/engine";

class MyScript extends Script {
  onAwake() {
    this.engine.on("Trigger", (...args) => {
      console.log("Trigger Event is Fired!", args);
    });
  }
}
```

**使用 `engine.once` 添加事件**

使用 `engine.once` 添加的事件只会触发一次回调函数。

```ts
import { Script } from "@galacean/engine";

class MyScript extends Script {
  onAwake() {
    this.engine.once("TriggerOnce", (...args) => {
      console.log("Trigger Event is Fired!", args);
    });
  }
}
```

保存代码后，我们就可以在事件面板中看到相应的事件。

## 触发事件

调用 `engine.dispatch` 方法可以派发事件，派发事件会使用 `dispatch` 中配置的参数来执行相应的回调函数。

```ts
this.engine.dispatch("Trigger", { eventData: "mydata" });
```

你可以在脚本的任何生命周期中触发事件，当然你也可以使用事件面板来触发事件，或者配置触发事件时所携带的参数。

## 移除事件

使用 `this.engine.off` 可以移除相关事件。

```ts
// Remove the specific function "fun" that listen to "Trigger".
this.engine.off("Trigger", fun);
// Remove all functions that listen to "Trigger".
this.engine.off("Trigger");
```
