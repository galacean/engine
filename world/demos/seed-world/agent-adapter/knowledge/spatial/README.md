# Space and Placement

## Usage Guide

Resolve relative directions through spatial.resolve; do not guess coordinates. Use spatial.check for a bounded check of exact positions (up to 32); it returns matches and failedConstraints for each point. Use spatial.search only to find candidates when the user asks for terrain conditions. nearest is a ranking anchor, not an exact sample. A finite search with no_match is finished, not proof that the entire continuous world is unsuitable. Do not loop to invent stricter requirements or replace a completed check with another search. spatial.teleport moves the player to a spatial target; subjectView frames a published subject through world parameters as described below. Heading 0 faces -Z, 90 faces +X. Placement constraints belong inside target. Read `../object-management/README.md` to locate an existing anchor.

`viewer` anchors use the player pose captured when the current instruction was submitted. That reference stays fixed across execute calls, player movement and teleportation. Consuming a new supplemental instruction replaces the reference with that input's pose. Without an active instruction, the anchor uses the live pose.

Use `await tools.spatial.viewer()` for the published live camera pose. Its `position` is the eye position in metres, and `forward` is the camera direction. The same snapshot provides `headingDegrees` (0=-Z, 90=+X, 180=+Z, 270=-X), `pitchDegrees` (positive upward) and `nearestHorizontalAxis` for describing the direction. A null angle or axis is undefined, not zero. It never reads an uncommitted teleport target. To verify a teleport, call it in the next execute after the teleport execute has committed. For a current ground check, pass `position[0]` and `position[2]` to `spatial.check`; do not use a frozen viewer anchor as a live readback.

`surface.water` answers whether the sampled point is covered by water. `riverDistanceMetres` is a legacy name for distance to inland water, including rivers, lakes and ponds, but excluding the ocean; `riverDistanceScope` states this scope. `nearestWaterDistanceMetres: null` explicitly means that distance to the nearest water of any kind was not measured. It does not mean no water exists or that the distance is infinite; the river distance cannot substitute for it. `moisture` is a normalized world surface field, not farm soil moisture or proof of water coverage. Answer a question about water underfoot from that point's `water` value. Discrete samples do not establish water coverage for an entire surrounding area. Report a distance only for the water category that was actually measured.

The live pose provides absolute eye coordinates relative to the world origin. Its Y coordinate is neither height above ground nor ground elevation. This read does not measure either height or identify a geographic region. For a position-and-direction question, report the coordinates and returned angles/axis. Additional ground claims require a separate surface measurement; geographic labels require a defined map reference.

## API Reference Index

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->

<!-- API_INDEX: generated from executable contracts at load time. -->
