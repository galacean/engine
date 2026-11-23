# XR Runtime Semantics

Use this reference when device construction, origin and camera ownership, session lifecycle, tracked input, or frame order affects an XR integration. XR is a version-matched companion capability; resolve exact symbols and platform support from its installed declarations.

## Construction and ownership

- The Engine creates an `xrManager` only when constructed with an XR device; a backend cannot be attached after creation. The WebXR backend package is `@galacean/engine-xr-webxr` and depends on `@galacean/engine-xr`.
- Construction sequence: load the backend, create the Engine with its XR device, create an `origin` Entity, parent Camera entities under `origin`, attach the AR center Camera or VR left/right Cameras, add features, then call `enterXR`.
- `origin` is application-owned and must be set before `enterXR`. WebXR tracks poses in its native local reference space, and `origin`'s world transform maps attached Camera local XR poses into scene world space.
- While a session is running, XR owns attached Cameras' local pose, projection, viewport, and XR camera type; avoid competing writes to those fields.

## Session lifecycle

Session state transitions along `None -> Initializing -> Initialized -> Running <-> Paused -> None`:

- Calling `enterXR(mode, false)` stops at `Initialized`; `sessionManager.run()` advances to `Running`.
- `sessionManager.stop()` pauses the session (`Paused`), retaining the native session, `origin`, features, and camera bindings so `run()` can resume it.
- `exitXR()` ends the native session and clears features; re-add features before entering a later session.
- Exiting restores framebuffer scheduling and pixel viewport, but does not detach Cameras or reset their transform, projection, viewport, or camera type; restore them explicitly before reusing those Cameras as ordinary Cameras.

## Input and frame order

- Tracked input objects are reused and mutated in place each XR frame; check tracking state before consuming a pose, and copy values that must outlive the frame.
- Button down/up flags are single-frame edges, while pressed state persists across frames.
- Verify hand-tracking and feature support via installed backend declarations and `isSupportedFeature(...)` / runtime checks rather than inferring support from enum members.
- In a running frame, updates flow through XR framebuffer, native events and tracked poses, attached Camera pose/projection, XR features, then ordinary input and Script callbacks, so Scripts observe the current XR frame.
