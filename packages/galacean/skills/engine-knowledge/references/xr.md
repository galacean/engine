# XR Runtime Semantics

Use this reference when device construction, origin and camera ownership, session lifecycle, tracked input, or frame order affects an XR integration. XR is a version-matched companion capability; resolve exact symbols and platform support from its installed declarations.

## Construction and ownership

- The Engine has an XR manager only when it is created with an XR device. A backend cannot be attached to an already-created Engine. The current WebXR backend package is `@galacean/engine-xr-webxr` and depends on the XR runtime package.
- The stable construction chain is: load the backend, create the Engine with its device, create an origin, parent Camera entities under that origin, attach the AR center Camera or VR left and right Cameras, add features, then enter XR.
- The origin is application-owned and must be set before session initialization. WebXR still uses its native local reference space; the origin's parent transform converts the attached Camera's local XR pose into scene world space.
- While a session is running, XR owns the attached Camera's local pose, projection, viewport, and XR camera type. Business logic must not compete for those fields.

## Session lifecycle

The lifecycle is `None -> Initializing -> Initialized -> Running <-> Paused -> None`.

- Entering with automatic run disabled stops at `Initialized`; running advances to `Running`.
- Stopping only pauses the session. It retains the native session, origin, features, and camera bindings and can run again.
- Exiting ends the native session and clears features. Add features again before a later session.
- Exit restores the framebuffer scheduling path and pixel viewport, but it does not detach Cameras or restore their transform, projection, viewport, or camera type. Application or toolkit code owns restoration before reusing them as ordinary Cameras.

## Input and frame order

- Tracked input objects are reused and updated in place each XR frame; they are not immutable snapshots. Check tracking state before consuming a pose.
- Button down and up values are per-frame edges, while pressed state persists across frames.
- Do not infer hand-tracking support from enum members alone. Use the installed backend declarations and runtime capability checks.
- In a running frame, ownership flows through the XR framebuffer, native events and tracked poses, attached Camera pose and projection, XR features, then ordinary input and Script callbacks. Scripts therefore observe the current XR frame.
