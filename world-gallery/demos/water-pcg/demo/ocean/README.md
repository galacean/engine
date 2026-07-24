# Ocean Showcase presentation limits

`OceanSplashVfxController` consumes the runtime's bounded `Impact` queue with one
pre-created `ParticleRenderer` and one `ParticleMaterial`. Each event only moves
the world-space emitter and calls `emit(count)`; no renderer, material, mesh, or
texture is created per event.

The current public particle path uses standard stretched billboards. It does not
claim soft-particle/depth-fade or water/rock particle collision, so intersections
can remain visible at grazing angles. Those are presentation limitations of this
Showcase fallback and are intentionally not worked around by changing Core.
