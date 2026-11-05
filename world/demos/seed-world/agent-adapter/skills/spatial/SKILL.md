---
name: spatial
description: 解析相对位置、按地形条件搜索地点、检查落点或传送玩家时使用。
---

# Space and Placement

## Usage Guide

Choose the workflow from the information you already have:

- Known world position: use a position anchor with relation `at` in the editing API's `target`.
- Position in a screenshot: use `pick` with the intended image pixel. Use its `estimatedPosition` as the captured surface position.
- Relative destination: use `spatial.resolve` to resolve the spatial relation. Use its returned Target directly.
- Conditions at known positions: use `spatial.check` when the user or editing contract requires a terrain check.
- Search by terrain conditions: use `spatial.search` to find candidates that meet the user's conditions.

## Position and placement

Specify placement rules inside `target.placement`, according to the editing API's contract.
For ground placement, use the intended horizontal position with `snapTo: "terrain"`. The editing API handles the final terrain height.
A screenshot position can be on grass or another visible surface. It does not prove the current ground height or placement conditions.
Use `spatial.check` if a required terrain condition remains unknown. It accepts up to 32 positions and returns `matches` and `failedConstraints` for each.

Choosing a location and identifying an editable object are separate tasks.
For a location, use the position workflow above. For an object edit, use the [object guide](skills/world-objects/SKILL.md) to resolve its identity and ownership.

## Search and navigation

In `spatial.search`, `nearest` ranks candidates around an anchor. It does not sample the exact anchor position.
A finite search that returns `no_match` is complete. It does not prove that every position in the world is unsuitable.
Further searches need a changed requirement or new evidence. Keep the user's conditions when a check or search finishes.

`spatial.teleport` moves the player to a spatial target. `subjectView` frames a published subject through world parameters, as described below.
Heading 0 faces -Z. Heading 90 faces +X.

`viewer` anchors use the player pose captured when the current instruction was submitted. That reference stays fixed across execute calls, player movement and teleportation. Consuming a new supplemental instruction replaces the reference with that input's pose. Without an active instruction, the anchor uses the live pose.

Use `await tools.spatial.viewer()` for the published live camera pose. Its `position` is the eye position in metres, and `forward` is the camera direction. The same snapshot provides `headingDegrees` (0=-Z, 90=+X, 180=+Z, 270=-X), `pitchDegrees` (positive upward) and `nearestHorizontalAxis` for describing the direction. A null angle or axis is undefined, not zero. It never reads an uncommitted teleport target. To verify a teleport, call it in the next execute after the teleport execute has committed. For a current ground check, pass `position[0]` and `position[2]` to `spatial.check`; do not use a frozen viewer anchor as a live readback.

`surface.water` answers whether the sampled point is covered by water. `riverDistanceMetres` is a legacy name for distance to inland water, including rivers, lakes and ponds, but excluding the ocean; `riverDistanceScope` states this scope. `nearestWaterDistanceMetres: null` explicitly means that distance to the nearest water of any kind was not measured. It does not mean no water exists or that the distance is infinite; the river distance cannot substitute for it. `moisture` is a normalized world surface field, not farm soil moisture or proof of water coverage. Answer a question about water underfoot from that point's `water` value. Discrete samples do not establish water coverage for an entire surrounding area. Report a distance only for the water category that was actually measured.

The live pose provides absolute eye coordinates relative to the world origin. Its Y coordinate is neither height above ground nor ground elevation. This read does not measure either height or identify a geographic region. For a position-and-direction question, report the coordinates and returned angles/axis. Additional ground claims require a separate surface measurement; geographic labels require a defined map reference.

## API Reference Index

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->

<!-- API_INDEX: generated from executable contracts at load time. -->
