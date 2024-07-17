---
order: 5
title: Event Communication
type: Script
label: Script
---

In projects developed using Galacean Engine, it is often necessary to communicate with the external environment, such as sending runtime information from the project to the outside, or receiving certain configuration information from the external environment. In such cases, you can use the event system of Galacean Engine to achieve this functionality.

## Add Events

Galacean Engine provides [EventDispatcher](/apis/core/#EventDispatcher) as the event class, and [Engine](/apis/core/#Engine) inherits from [EventDispatcher](/apis/core/#EventDispatcher). Therefore, we can directly use `engine` in the code as a medium for internal and external communication.

**Add an event using `engine.on`**

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

**Add an event using `engine.once`**

Events added using `engine.once` will trigger the callback function only once.

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

After saving the code, we can see the corresponding events in the event panel.

## Trigger Events

Calling the `engine.dispatch` method can dispatch events. Dispatching events will execute the corresponding callback functions using the parameters configured in `dispatch`.

```ts
this.engine.dispatch("Trigger", { eventData: "mydata" });
```

You can trigger events at any lifecycle of the script. Of course, you can also trigger events using the event panel or configure the parameters to be carried when triggering events.

## Remove Events

Use `this.engine.off` to remove related events.

```ts
// Remove the specific function "fun" that listen to "Trigger".
this.engine.off("Trigger", fun);
// Remove all functions that listen to "Trigger".
this.engine.off("Trigger");
```
