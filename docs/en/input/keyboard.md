---
order: 2
title: Keyboard
type: Interaction
label: Interact
---

Galacean supports developers to query the current keyboard interaction status at any time, and the API calls are very simple.

## Methods

| Method Name                                               | Method Definition           |
| --------------------------------------------------------- | ---------------------------- |
| [isKeyHeldDown](/apis/core/#InputManager-isKeyHeldDown)    | Returns whether the key is held down continuously |
| [isKeyDown](/apis/core/#InputManager-isKeyDown)            | Returns whether the key was pressed during the current frame |
| [isKeyUp](/apis/core/#InputManager-isKeyUp)                | Returns whether the key was released during the current frame |

## Quick Start

Below are simple examples of checking the key status.

```typescript
class KeyScript extends Script {
  onUpdate() {
    const { inputManager } = this.engine;
    if (inputManager.isKeyHeldDown(Keys.Space)) {
      // 现在还按着空格键
    }
    if (inputManager.isKeyDown(Keys.Space)) {
      // 这帧按下过空格键
    }
    if (inputManager.isKeyUp(Keys.Space)) {
      // 这帧抬起过空格键
    }
  }
}
```

## Practical Use

Let's control the angry bird with the space key this time.

<playground src="flappy-bird.ts"></playground>

## State Dictionary

| Key State                                                | isKeyHeldDown | isKeyDown | isKeyUp |
| -------------------------------------------------------- | ------------- | --------- | ------- |
| Key has been held down since the previous frame          | true          | false     | false   |
| Key was pressed during the current frame and not released| true          | true      | false   |
| Key was released and pressed again during the current frame| true        | true      | true    |
| Key was pressed and released during the current frame    | false         | true      | true    |
| Key was released during the current frame                | false         | false     | true    |
| Key is not pressed and has no interaction                | false         | false     | false   |
| This scenario will not occur                             | true          | false     | true    |
| This scenario will not occur                             | false         | true      | false   |

## Keys

The keyboard keys enumerated by Galacean correspond one-to-one with physical keyboard keys, following the W3C standard, and are compatible with various special keys on different hardware.

Keys Enumeration: [Keys.ts](https://github.com/galacean/engine/blob/main/packages/core/src/input/enums/Keys.ts)

W3C Standard: [W3C UI Events Code](https://www.w3.org/TR/2017/CR-uievents-code-20170601/)

Keyboard Input Design Approach: [Keyboard Input Design](https://github.com/galacean/engine/wiki/Keyboard-Input-design)

