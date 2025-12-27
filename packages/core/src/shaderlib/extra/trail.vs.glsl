// Trail vertex attributes (per-vertex)
// Each segment has 2 vertices (top and bottom)
attribute vec4 a_PositionBirthTime; // xyz: World position, w: Birth time
attribute vec4 a_Color;         // Color at this point (unused when gradient is used)
attribute vec4 a_CornerTangent; // x: Corner (-1 or 1), yzw: Tangent direction

// Uniforms
uniform float renderer_CurrentTime;
uniform float renderer_Lifetime;
uniform float renderer_Width;    // Base width
uniform int renderer_TextureMode;  // 0: Stretch, 1: Tile
uniform float renderer_TileScale;

uniform vec3 camera_Position;
uniform mat4 camera_ViewMat;
uniform mat4 camera_ProjMat;

// Width curve uniforms (4 keyframes max: x=time, y=value)
uniform vec2 renderer_WidthCurve[4];
uniform int renderer_WidthCurveCount;

// Color gradient uniforms
uniform vec4 renderer_ColorKeys[4];  // x=time, yzw=rgb
uniform int renderer_ColorKeyCount;
uniform vec2 renderer_AlphaKeys[4];  // x=time, y=alpha
uniform int renderer_AlphaKeyCount;

// Varyings
varying vec2 v_uv;
varying vec4 v_color;

// Evaluate curve at normalized age
float evaluateCurve(in vec2 keys[4], in int count, in float t) {
    if (count <= 0) return 1.0;
    if (count == 1) return keys[0].y;

    for (int i = 1; i < 4; i++) {
        if (i >= count) break;
        if (t <= keys[i].x) {
            float t0 = keys[i - 1].x;
            float t1 = keys[i].x;
            float v0 = keys[i - 1].y;
            float v1 = keys[i].y;
            float factor = (t - t0) / (t1 - t0);
            return mix(v0, v1, factor);
        }
    }
    return keys[count - 1].y;
}

// Evaluate color gradient at normalized age
vec3 evaluateColorGradient(in vec4 keys[4], in int count, in float t) {
    if (count <= 0) return vec3(1.0);
    if (count == 1) return keys[0].yzw;

    for (int i = 1; i < 4; i++) {
        if (i >= count) break;
        if (t <= keys[i].x) {
            float t0 = keys[i - 1].x;
            float t1 = keys[i].x;
            vec3 c0 = keys[i - 1].yzw;
            vec3 c1 = keys[i].yzw;
            float factor = (t - t0) / (t1 - t0);
            return mix(c0, c1, factor);
        }
    }
    return keys[count - 1].yzw;
}

// Evaluate alpha gradient at normalized age
float evaluateAlphaGradient(in vec2 keys[4], in int count, in float t) {
    if (count <= 0) return 1.0;
    if (count == 1) return keys[0].y;

    for (int i = 1; i < 4; i++) {
        if (i >= count) break;
        if (t <= keys[i].x) {
            float t0 = keys[i - 1].x;
            float t1 = keys[i].x;
            float a0 = keys[i - 1].y;
            float a1 = keys[i].y;
            float factor = (t - t0) / (t1 - t0);
            return mix(a0, a1, factor);
        }
    }
    return keys[count - 1].y;
}

void main() {
    // Extract position and birth time
    vec3 position = a_PositionBirthTime.xyz;
    float birthTime = a_PositionBirthTime.w;
    float corner = a_CornerTangent.x;
    vec3 tangent = a_CornerTangent.yzw;

    // Calculate normalized age (0 = new, 1 = about to die)
    float age = renderer_CurrentTime - birthTime;
    float normalizedAge = clamp(age / renderer_Lifetime, 0.0, 1.0);

    // Discard vertices that have exceeded their lifetime
    if (normalizedAge >= 1.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // Move outside clip space
        return;
    }

    // Calculate billboard offset (View alignment)
    vec3 toCamera = normalize(camera_Position - position);
    vec3 right = cross(tangent, toCamera);
    float rightLen = length(right);

    // Handle edge case when tangent is parallel to camera direction
    if (rightLen < 0.001) {
        right = cross(tangent, vec3(0.0, 1.0, 0.0));
        rightLen = length(right);
        if (rightLen < 0.001) {
            right = cross(tangent, vec3(1.0, 0.0, 0.0));
            rightLen = length(right);
        }
    }
    right = right / rightLen;

    // Evaluate width curve
    float widthMultiplier = evaluateCurve(renderer_WidthCurve, renderer_WidthCurveCount, normalizedAge);
    float width = renderer_Width * widthMultiplier;

    // Apply offset
    vec3 worldPosition = position + right * width * 0.5 * corner;

    gl_Position = camera_ProjMat * camera_ViewMat * vec4(worldPosition, 1.0);

    // Calculate UV based on texture mode
    float u = corner * 0.5 + 0.5;  // 0 for bottom, 1 for top
    float v;

    if (renderer_TextureMode == 0) {
        // Stretch mode: UV.v based on normalized age
        v = normalizedAge;
    } else {
        // Tile mode: scale by tile scale
        v = normalizedAge * renderer_TileScale;
    }

    v_uv = vec2(u, v);

    // Evaluate color gradient or use vertex color
    if (renderer_ColorKeyCount > 0 || renderer_AlphaKeyCount > 0) {
        vec3 gradientColor = evaluateColorGradient(renderer_ColorKeys, renderer_ColorKeyCount, normalizedAge);
        float gradientAlpha = evaluateAlphaGradient(renderer_AlphaKeys, renderer_AlphaKeyCount, normalizedAge);
        v_color = vec4(gradientColor, gradientAlpha);
    } else {
        v_color = a_Color;
    }
}

