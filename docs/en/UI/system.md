---
order: 2
title: Architecture
type: UI
label: UI
---

## System Design

```mermaid
---
title: UI System
---
classDiagram
    Component <|-- Transform
    Script <|-- Component
    Transform <|-- UITransform
    Component <|-- Renderer
    Renderer <|-- UIRenderer
    UIRenderer <|-- Image
    UIRenderer <|-- Text
    UICanvas <|-- Component
    UIInteractive <|-- Script
    Button <|-- UIInteractive
    UIGroup <|-- Component

    class Script {
        +void onUpdate()
    }

    class Transform{
        +Vector3 position
        +Vector3 rotation
        +Vector3 scale
        ...
    }

    class UITransform{
        <<Added>>
        +Vector2 size
        +Vector2 pivot
    }

    class Renderer{
        +BoundingBox bounds
        +Material getMaterial()
        +Material setMaterial()
    }

    class UIRenderer{
        <<Added>>
        +Color color
        +boolean raycastEnabled
        +vec4 raycastPadding
    }

    class Image{
        <<Added>>
        +Sprite sprite
        +SpriteDrawMode drawMode
        ...
    }

    class Text{
        <<Added>>
        +string text
        +Font font
        ...
    }

    class UICanvas {
        <<Added>>
        +CanvasRenderMode renderMode
        +Camera renderCamera
        ...
    }

    class UIInteractive {
        <<Added>>
        +boolean interactive
        +Transition transitions
        ...
    }

    class Button {
        <<Added>>
        +void addClicked()
        +void removeClicked()
        ...
    }

    class UIGroup {
        <<Added>>
        +boolean interactive
        +number alpha
        +boolean ignoreParentGroup
    }
```

## Module Management

| Package                                                                 | Description     | Related Documentation   |
| :--------------------------------------------------------------------- | :------------- | ----------------------- |
| [@galacean/engine-ui](https://www.npmjs.com/package/@galacean/engine-xr) | Core architecture logic | [API](/apis/galacean)    |

> `@galacean/engine-ui` is a dependency that must be included to implement **UI**.

> The [version dependency rules](/docs/basics/version/#version-dependency) must be followed, meaning the version of `@galacean/engine-ui` should match the version of `@galacean/engine`.