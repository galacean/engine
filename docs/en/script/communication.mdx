---
order: 5
title: Event Communication
type: Script
label: Script
---

Projects developed with Galacean Engine often need to communicate with the external environment, such as sending runtime information of the project to the outside or obtaining certain configuration information from the external environment. At this time, you can use the event system of Galacean Engine to achieve such functions.

## Adding Events

Galacean Engine provides [EventDispatcher](/apis/core/#EventDispatcher) as the event class, and [Engine](/apis/core/#Engine) inherits from [EventDispatcher](/apis/core/#EventDispatcher). Therefore, we directly use `engine` in the code as the medium for internal and external communication.

**Add events using `engine.on`**

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

**Add events using `engine.once`**

Events added using `engine.once` will only trigger the callback function once.

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

## Triggering Events

Calling the `engine.dispatch` method can dispatch events. Dispatching events will execute the corresponding callback function using the parameters configured in `dispatch`.

```ts
this.engine.dispatch("Trigger", { eventData: "mydata" });
```

You can trigger events in any lifecycle of the script. Of course, you can also use the event panel to trigger events or configure the parameters carried when triggering events.

## Removing Events

You can remove related events using `this.engine.off`.

```ts
// Remove the specific function "fun" that listen to "Trigger".
this.engine.off("Trigger", fun);
// Remove all functions that listen to "Trigger".
this.engine.off("Trigger");
```
