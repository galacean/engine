attribute vec4 a_PositionBirthTime; // xyz: World position, w: Birth time
attribute vec4 a_CornerTangent;     // x: Corner (-1 or 1), yzw: Tangent direction
attribute float a_Distance;         // Absolute cumulative distance (written once per point)

uniform vec4 renderer_TrailParams;    // x: Width, y: TextureMode (0: Stretch, 1: Tile), z: TextureScale
uniform vec4 renderer_TimeDistParams; // x: CurrentTime, y: Lifetime, z: HeadDistance, w: TailDistance
uniform vec3 camera_Position;
uniform mat4 camera_ViewMat;
uniform mat4 camera_ProjMat;
uniform vec2 renderer_WidthCurve[4];   // Width curve (4 keyframes max: x=time, y=value)
uniform vec4 renderer_ColorKeys[4];   // Color gradient (x=time, yzw=rgb)
uniform vec2 renderer_AlphaKeys[4];   // Alpha gradient (x=time, y=alpha)
uniform vec4 renderer_CurveMaxTime; // x: colorMaxTime, y: alphaMaxTime, z: widthMaxTime

varying vec2 v_uv;
varying vec4 v_color;

#include <particle_common>

void main() {
    vec3 position = a_PositionBirthTime.xyz;
    float birthTime = a_PositionBirthTime.w;
    float corner = a_CornerTangent.x;
    vec3 tangent = a_CornerTangent.yzw;

    // age: time since birth, normalizedAge: 0=new, 1=expired
    float age = renderer_TimeDistParams.x - birthTime;
    float normalizedAge = age / renderer_TimeDistParams.y;

    // Distance-based relative position: 0=head(newest), 1=tail(oldest)
    float distFromHead = renderer_TimeDistParams.z - a_Distance;
    float totalDist = renderer_TimeDistParams.z - renderer_TimeDistParams.w;
    float relativePos = totalDist > 0.0 ? distFromHead / totalDist : 0.0;

    // Billboard: expand perpendicular to tangent and view direction
    vec3 toCamera = normalize(camera_Position - position);
    vec3 right = cross(tangent, toCamera);
    float rightLenSq = dot(right, right);
    if (rightLenSq < 0.000001) {
        right = cross(tangent, vec3(0.0, 1.0, 0.0));
        rightLenSq = dot(right, right);
        if (rightLenSq < 0.000001) {
            right = cross(tangent, vec3(1.0, 0.0, 0.0));
            rightLenSq = dot(right, right);
        }
    }
    right = right * inversesqrt(rightLenSq);

    float widthMultiplier = evaluateParticleCurve(renderer_WidthCurve, min(relativePos, renderer_CurveMaxTime.z));
    float width = renderer_TrailParams.x * widthMultiplier;
    vec3 worldPosition = position + right * width * 0.5 * corner;

    gl_Position = camera_ProjMat * camera_ViewMat * vec4(worldPosition, 1.0);

    // UV: u=corner side, v=position along trail
    float u = corner * 0.5 + 0.5;
    // Stretch: normalize to 0-1, Tile: use world distance directly
    float v = renderer_TrailParams.y == 0.0 ? relativePos : distFromHead;
    v_uv = vec2(u, v * renderer_TrailParams.z);

    v_color = evaluateParticleGradient(renderer_ColorKeys, renderer_CurveMaxTime.x, renderer_AlphaKeys, renderer_CurveMaxTime.y, relativePos);
}
