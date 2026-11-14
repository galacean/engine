# Primitive mesh visual tests

The suite contains six galleries with 90 examples. Each screenshot fixes the camera, lighting and parameters so changes can be compared with the checked-in baseline.

| Case | Examples | Coverage |
| --- | --: | --- |
| `primitive-all` | 20 | Every primitive factory, including the four regular polyhedra |
| `primitive-sphere-sections` | 6 | Complete sphere, hemispheres, octant, latitude band and a range crossing 360 degrees |
| `primitive-sections` | 15 | Circle/ring sectors, both torus ranges, cylinder cap combinations, cone caps and partial lathes |
| `primitive-contours` | 12 | Concave contours, multiple holes/shapes, bevel size/thickness/offset, tubes and profile sweeps |
| `primitive-topology` | 25 | Sphere subdivisions, directional segment counts, polyhedron subdivisions, rounded corners and torus knots |
| `primitive-materials` | 12 | Material-slot order, multiple shapes, `keepData`, JSON asset loading and corner-radius clamping |

Run all six galleries:

```sh
pnpm exec playwright test --project=chromium --workers=1 --reporter=line --grep 'Primitive (all|sphere-sections|sections|contours|topology|materials)$'
```

After changing engine package sources, run `pnpm run build` before the tests. To inspect a gallery interactively, run `pnpm run e2e:case` and open `http://localhost:5175/mpa/primitive-all.html`, replacing the filename with another case above.

Inspect the images in `e2e/downloads` before accepting a new baseline under `e2e/fixtures/originImage`. The topology gallery offsets its line overlay slightly along the normals to avoid depth fighting; it does not modify the displayed surface. Red and gold grid lines mark texture-coordinate boundaries. Open cuts and tubes intentionally have no end caps. The new galleries render front faces, so a cut can expose the background through the mesh.

The all-primitives gallery checks that every factory is represented. The material gallery also asserts sub-mesh counts, CPU-data accessibility and the loaded mesh's vertex count before making the screenshot available.
