// Material roughness uses centered depth, independent of refraction and its final optical path.
        float effectiveSurfaceRoughness;
        {
#if {{ROUGHNESS_CONTACT_DEPTH_ENABLED}}
          float centeredDepthBehind = smoothstep(0.03, 0.22, sampledOpticalDepth);
#endif
{{ROUGHNESS_BOUNDARY_STATEMENTS}}
          effectiveSurfaceRoughness = resolvedBoundaryRoughness;
        }
