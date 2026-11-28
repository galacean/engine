#ifndef WIND_OVER_LIFETIME_INCLUDED
#define WIND_OVER_LIFETIME_INCLUDED

#ifdef RENDERER_WOL_MODULE_ENABLED
    vec3 renderer_WOLTargetVelocity;
    vec3 renderer_WOLInfluence;
    float renderer_WOLResponseTime;
    vec3 renderer_WOLWrapCenter;
    vec3 renderer_WOLWrapSize;

    float wrapWindPositionAxis(float position, float center, float size) {
        if (size <= 0.0) return position;
        float halfSize = size * 0.5;
        return mod(position - center + halfSize, size) - halfSize + center;
    }

    vec3 wrapWindPositionWS(vec3 positionWS) {
        return vec3(
            wrapWindPositionAxis(positionWS.x, renderer_WOLWrapCenter.x, renderer_WOLWrapSize.x),
            wrapWindPositionAxis(positionWS.y, renderer_WOLWrapCenter.y, renderer_WOLWrapSize.y),
            wrapWindPositionAxis(positionWS.z, renderer_WOLWrapCenter.z, renderer_WOLWrapSize.z)
        );
    }

    void windRelaxAxis(
        float currentVelocity,
        float targetVelocity,
        float influence,
        float deltaTime,
        out float relaxedVelocity,
        out float positionCorrection
    ) {
        float follow = clamp(influence, 0.0, 1.0);
        if (follow <= 1e-8) {
            relaxedVelocity = currentVelocity;
            positionCorrection = 0.0;
        } else if (renderer_WOLResponseTime <= 1e-8) {
            relaxedVelocity = targetVelocity;
            positionCorrection = 0.0;
        } else {
            float responseRate = follow / renderer_WOLResponseTime;
            float decay = exp(-responseRate * deltaTime);
            relaxedVelocity = targetVelocity + (currentVelocity - targetVelocity) * decay;
            float exactDisplacement = targetVelocity * deltaTime +
                (currentVelocity - targetVelocity) * (1.0 - decay) / responseRate;
            positionCorrection = exactDisplacement - relaxedVelocity * deltaTime;
        }
    }

    void applyWindVelocityRelaxation(
        vec3 currentVelocityWS,
        float deltaTime,
        out vec3 relaxedVelocityWS,
        out vec3 positionCorrectionWS
    ) {
        windRelaxAxis(
            currentVelocityWS.x,
            renderer_WOLTargetVelocity.x,
            renderer_WOLInfluence.x,
            deltaTime,
            relaxedVelocityWS.x,
            positionCorrectionWS.x
        );
        windRelaxAxis(
            currentVelocityWS.y,
            renderer_WOLTargetVelocity.y,
            renderer_WOLInfluence.y,
            deltaTime,
            relaxedVelocityWS.y,
            positionCorrectionWS.y
        );
        windRelaxAxis(
            currentVelocityWS.z,
            renderer_WOLTargetVelocity.z,
            renderer_WOLInfluence.z,
            deltaTime,
            relaxedVelocityWS.z,
            positionCorrectionWS.z
        );
    }
#endif

#endif
