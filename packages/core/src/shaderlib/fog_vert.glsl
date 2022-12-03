#if OASIS_FOG_MODE > 0
    v_fogDistance = ( u_MVMat * position ).xyz;
    // float ComputeFogFactor(float zCS)
    // {
    //     // remap [-near, far] to [0, far]
    //     float z0Far = max(((zCS + oasis_ProjectionParams.x) / (oasis_ProjectionParams.x + oasis_ProjectionParams.y)) * oasis_ProjectionParams.y, 0);

    //     #ifdef OASIS_FOG_MODE == Linear
    //         // (fogEnd - z0Far) / (fogEnd - fogStart) = z * (-1 / (fogEnd-fogStart)) + (fogEnd / (fogEnd-fogStart))
    //         return z0Far * oasis_FogParams.x + oasis_FogParams.y;
    //     #elif defined(OASIS_FOG_MODE == Exponential) || defined(OASIS_FOG_MODE == ExponentialSquared)
    //         // z0Far * (density / Math.sqrt(Math.LN2))
    //         return z0Far * oasis_FogParams.z;
    //     #endif
    // }

    //v_fogDepth = ComputeFogFactor(gl_Position.z);
#endif
