---
order: 6
title: Rendering Order
type: UI
label: UI
---

The rendering order of UI components follows two rules:

- Different `UICanvas` instances follow a specific rendering order based on their `RendererMode` type.
- `UIRenderer` components under a `UICanvas` are rendered according to a **depth-first** order, from parent to child, and from left to right.

## UICanvas

Assume the current runtime:
- There is a scene `Scene`
- The scene `Scene` contains two cameras, `Camera1` and `Camera2`
- The scene `Scene` contains three canvases:
  - `Canvas1` with `WorldSpace` render mode
  - `Canvas2` with `ScreenSpace-Overlay` render mode
  - `Canvas3` with `ScreenSpace-Camera` render mode, using `Camera1` as the render camera

```mermaid
journey
    title Scene Rendering Cycle
    section Camera1.render
      Canvas1.render: 5
      Canvas3.render: 5
    section Camera2.render
      Canvas1.render: 5
    section Ending
      Canvas2.render: 5
```

It's important to note:
- Canvases with `ScreenSpace-Camera` render mode will only render with their corresponding camera, and they follow the general camera clipping rules, just like canvases with `ScreenSpace-Overlay` render mode.
- Canvases with `ScreenSpace-Overlay` render mode can still be rendered without a camera.
- Within the same camera, the rendering order of `UICanvas` follows these rules: canvases in the overlay mode have their rendering order determined only by `sortOrder`.

```mermaid
flowchart TD
    A[Sort rendering data] --> B{canvas.sortOrder}
    B -->|Not equal| C[Return comparison result]
    B -->|Equal| D{Canvas and camera distance}
    D -->|Not equal| E[Return comparison result]
    D -->|Equal| F[Return comparison result]
```

## UIRenderer Rendering Order

```mermaid
stateDiagram
    RootCanvas --> A
    RootCanvas --> F
    A --> B
    A --> E
    B --> C
    B --> D
```

As shown in the diagram above, the rendering order under the root canvas follows A -> B -> C -> D -> E -> F. It is important to note that setting `UIRenderer.priority` does not change its rendering order.