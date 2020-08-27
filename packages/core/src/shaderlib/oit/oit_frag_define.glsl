#if defined(ALPHA_BLEND) && defined(OIT_ENABLE)

    uniform sampler2D u_depthSampler;

    float weight(float z, float a) {
        return a * clamp(3e3 * pow(1.0 - z, 3.0), 1e-2, 3e3);
//          return pow(z,-5.0);
    }
#endif
