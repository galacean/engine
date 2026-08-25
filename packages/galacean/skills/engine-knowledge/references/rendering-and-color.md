# Rendering and Color Ownership

Use this reference when material sharing or color-space intent affects the rendered result.

## Material state

- A renderer's assigned material is a shared resource. Mutating it affects every renderer that refers to that same material instance.
- Requesting an instance material clones the assigned material for that renderer. Use this only when per-renderer mutation is intentional; otherwise retain the shared material and avoid the extra resource.
- A missing material slot has no instance to clone. Treat material lookup as nullable rather than assuming slot zero exists.
- Shader property names and macros are shader contracts, not universal Engine names. Resolve them from the selected shader or material implementation.

## Color-space intent

- Lighting and material computation use linear values.
- Color textures normally represent sRGB content and should be decoded for linear computation. Data textures such as normals, masks, and packed material channels remain linear.
- Render-target color-space flags describe the stored data and conversion behavior. They must match the pass that writes and later samples the target.
- Screen output performs the final conversion required for display. Avoid manually applying another conversion unless a custom pass explicitly owns that transform.

## Decision rule

Classify every texture by data meaning, not filename. Keep one material owner unless independent mutation is required, and keep color conversion at the boundary that changes representation.
