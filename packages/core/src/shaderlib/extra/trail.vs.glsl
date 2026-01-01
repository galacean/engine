attribute vec4 a_PositionBirthTime; // xyz: World position, w: Birth time
attribute vec4 a_CornerTangent;     // x: Corner (-1 or 1), yzw: Tangent direction

uniform vec4 renderer_TimeParams;   // x: CurrentTime, y: Lifetime, z: OldestBirthTime, w: NewestBirthTime
uniform vec4 renderer_TrailParams;  // x: Width, y: TextureMode (0: Stretch, 1: Tile), z: TextureScale
uniform vec3 camera_Position;
uniform mat4 camera_ViewMat;
uniform mat4 camera_ProjMat;
uniform vec2 renderer_WidthCurve[4];   // Width curve (4 keyframes max: x=time, y=value)
uniform vec4 renderer_ColorKeys[4];   // Color gradient (x=time, yzw=rgb)
uniform vec2 renderer_AlphaKeys[4];   // Alpha gradient (x=time, y=alpha)
uniform vec4 renderer_GradientMaxTime; // x: colorMaxTime, y: alphaMaxTime

varying vec2 v_uv;
varying vec4 v_color;

#include <particle_common>

void main() {
    vec3 position = a_PositionBirthTime.xyz;
    float birthTime = a_PositionBirthTime.w;
    float corner = a_CornerTangent.x;
    vec3 tangent = a_CornerTangent.yzw;
    float newestBirthTime = renderer_TimeParams.w;

    // age: time since birth, normalizedAge: 0=new, 1=expired
    float age = renderer_TimeParams.x - birthTime;
    float normalizedAge = clamp(age / renderer_TimeParams.y, 0.0, 1.0);

    // Discard expired vertices
    if (normalizedAge >= 1.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    // relativePosition: 0=head(newest), 1=tail(oldest)
    float timeRange = newestBirthTime - renderer_TimeParams.z;
    float relativePosition = 0.0;
    if (timeRange > 0.0001) {
        relativePosition = (newestBirthTime - birthTime) / timeRange;
    }

    // Billboard: expand perpendicular to tangent and view direction
    vec3 toCamera = normalize(camera_Position - position);
    vec3 right = cross(tangent, toCamera);
    float rightLen = length(right);
    if (rightLen < 0.001) {
        right = cross(tangent, vec3(0.0, 1.0, 0.0));
        rightLen = length(right);
        if (rightLen < 0.001) {
            right = cross(tangent, vec3(1.0, 0.0, 0.0));
            rightLen = length(right);
        }
    }
    right = right / rightLen;

    float widthMultiplier = evaluateParticleCurve(renderer_WidthCurve, relativePosition);
    float width = renderer_TrailParams.x * widthMultiplier;
    vec3 worldPosition = position + right * width * 0.5 * corner;

    gl_Position = camera_ProjMat * camera_ViewMat * vec4(worldPosition, 1.0);

    // UV: u=corner side, v=position along trail or tiled
    float u = corner * 0.5 + 0.5;
    float v = renderer_TrailParams.y < 0.5
        ? relativePosition
        : normalizedAge * renderer_TrailParams.z;
    v_uv = vec2(u, v);

    v_color = evaluateParticleGradient(renderer_ColorKeys, renderer_GradientMaxTime.x, renderer_AlphaKeys, renderer_GradientMaxTime.y, relativePosition);
}
