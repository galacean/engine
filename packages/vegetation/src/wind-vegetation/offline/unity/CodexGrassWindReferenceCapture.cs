using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// Deterministic capture of the original ANGRY MESH grass wind receiver.
///
/// Install this file under Assets/Editor in the reference Unity project and invoke:
///   -executeMethod CodexGrassWindReferenceCapture.Capture
///
/// CODEX_GRASS_REFERENCE_OUTPUT may override the output directory. The source shader is copied
/// verbatim; only _TimeParameters.x is redirected to a fixed capture-time uniform.
/// </summary>
public static class CodexGrassWindReferenceCapture
{
    private const string GrassShaderSourcePath =
        "Assets/ANGRY MESH/Stylized Pack - Common/Shaders/S_Grass.shader";
    private const string WaveTexturePath =
        "Assets/ANGRY MESH/Stylized Pack - Common/Sources/Textures/T_Noise_02_M.tif";
    private const string ControlledShaderDirectory = "Assets/CodexGrassWindCaptureTemp";
    private const string ControlledShaderPath = ControlledShaderDirectory + "/S_Grass_Controlled.shader";
    private const string OriginalShaderName = "ANGRYMESH/Stylized Pack/Grass";
    private const string ControlledShaderName = "Hidden/Codex Wind Reference/Grass Controlled";
    private const int Width = 640;
    private const int Height = 360;
    private const int FramesPerSecond = 30;
    private const int FrameCount = 181;

    private static readonly string[] GrassPrefabPaths =
    {
        "Assets/ANGRY MESH/Stylized Pack - Meadow Environment/Prefabs/Grass/Grass - Summer/P_Grass_01_Summer_01.prefab",
        "Assets/ANGRY MESH/Stylized Pack - Meadow Environment/Prefabs/Grass/Grass - Summer/P_Grass_02_Summer_01.prefab",
        "Assets/ANGRY MESH/Stylized Pack - Meadow Environment/Prefabs/Grass/Grass - Summer/P_Grass_03_Summer_01.prefab"
    };

    [Serializable]
    private sealed class CaptureMetadata
    {
        public int version = 1;
        public string unityVersion;
        public string sourceShader;
        public string[] prefabs;
        public string outputDirectory;
        public int width;
        public int height;
        public int framesPerSecond;
        public int frameCount;
        public float[] windDirection;
        public float windGrassSpeed;
        public float windGrassTurbulence;
        public float windGrassFlexibility;
        public float windGrassWavesAmplitude;
        public float windGrassWavesSpeed;
        public float windGrassWavesScale;
        public string amplitudeSchedule;
        public string timeSource;
    }

    public static void Capture()
    {
        var ownedMaterials = new List<Material>();
        try
        {
            var outputDirectory = Environment.GetEnvironmentVariable("CODEX_GRASS_REFERENCE_OUTPUT");
            if (string.IsNullOrWhiteSpace(outputDirectory))
            {
                outputDirectory = Path.Combine(Path.GetTempPath(), "p3-unity-grass-reference");
            }
            Directory.CreateDirectory(outputDirectory);

            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var controlledShader = CreateControlledShaderAsset();
            var waveTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(WaveTexturePath);
            if (waveTexture == null) throw new InvalidOperationException("Original grass wave texture is missing.");

            CreateGrassPatch(controlledShader, ownedMaterials);
            CreateGround();
            CreateLight();
            var camera = CreateCamera();
            QualitySettings.antiAliasing = 0;
            camera.allowMSAA = false;

            // Compile and warm all variants before timing/capture starts.
            ApplyFrameGlobals(0f, ResolveAmplitude(0f), waveTexture);
            RenderFrame(camera, null);
            RenderFrame(camera, null);

            for (var frame = 0; frame < FrameCount; frame++)
            {
                var time = (float)frame / FramesPerSecond;
                var amplitude = ResolveAmplitude(time);
                ApplyFrameGlobals(time, amplitude, waveTexture);
                RenderFrame(
                    camera,
                    Path.Combine(outputDirectory, $"unity-grass-f{frame:0000}-t{time:0.000}-a{amplitude:0.000}.png")
                );
            }

            var metadata = new CaptureMetadata
            {
                unityVersion = Application.unityVersion,
                sourceShader = GrassShaderSourcePath,
                prefabs = GrassPrefabPaths,
                outputDirectory = outputDirectory,
                width = Width,
                height = Height,
                framesPerSecond = FramesPerSecond,
                frameCount = FrameCount,
                windDirection = new[] { 0.8944272f, 0f, 0.4472136f },
                windGrassSpeed = 1f,
                windGrassTurbulence = 1f,
                windGrassFlexibility = 3f,
                windGrassWavesAmplitude = 1.5f,
                windGrassWavesSpeed = 1f,
                windGrassWavesScale = 1f,
                amplitudeSchedule = "0.5 at 0-1s; smoothstep to 5 at 2.5s; hold to 3.5s; smoothstep to 0.5 at 5.5s",
                timeSource = "Original ANGRY MESH shader with only _TimeParameters.x redirected to _CodexGrassWindTime"
            };
            File.WriteAllText(
                Path.Combine(outputDirectory, "unity-grass-capture-metadata.json"),
                JsonUtility.ToJson(metadata, true)
            );
            Debug.Log($"CODEX_GRASS_WIND_REFERENCE_OK {outputDirectory} frames={FrameCount}");
            Cleanup(ownedMaterials);
            DeleteControlledShaderAssets();
            EditorApplication.Exit(0);
        }
        catch (Exception exception)
        {
            Cleanup(ownedMaterials);
            DeleteControlledShaderAssets();
            Debug.LogException(exception);
            EditorApplication.Exit(1);
        }
    }

    private static Shader CreateControlledShaderAsset()
    {
        DeleteControlledShaderAssets();
        var projectRoot = Directory.GetParent(Application.dataPath)?.FullName;
        if (string.IsNullOrWhiteSpace(projectRoot))
        {
            throw new InvalidOperationException("Unity project root is unavailable.");
        }
        var source = File.ReadAllText(Path.Combine(projectRoot, GrassShaderSourcePath));
        var declaration = $"Shader \"{OriginalShaderName}\"";
        if (!source.Contains(declaration))
        {
            throw new InvalidDataException("Original grass shader declaration changed.");
        }
        var timeReferenceCount = CountOccurrences(source, "_TimeParameters.x");
        const string uniformAnchor = "half ASPW_WindToggle;";
        var uniformAnchorCount = CountOccurrences(source, uniformAnchor);
        if (timeReferenceCount == 0 || uniformAnchorCount == 0)
        {
            throw new InvalidDataException("Original grass shader no longer exposes the expected wind graph.");
        }
        var patched = source
            .Replace(declaration, $"Shader \"{ControlledShaderName}\"")
            .Replace("_TimeParameters.x", "_CodexGrassWindTime")
            .Replace(
                uniformAnchor,
                uniformAnchor + "\n\t\t\tfloat _CodexGrassWindTime;"
            );
        if (CountOccurrences(patched, "_CodexGrassWindTime") != timeReferenceCount + uniformAnchorCount)
        {
            throw new InvalidDataException("Controlled grass time replacement is incomplete.");
        }
        Directory.CreateDirectory(Path.Combine(projectRoot, ControlledShaderDirectory));
        File.WriteAllText(Path.Combine(projectRoot, ControlledShaderPath), patched);
        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        var shader = AssetDatabase.LoadAssetAtPath<Shader>(ControlledShaderPath);
        if (shader == null) throw new InvalidOperationException("Controlled grass shader import failed.");
        return shader;
    }

    private static int CountOccurrences(string source, string value)
    {
        var count = 0;
        for (var offset = 0; (offset = source.IndexOf(value, offset, StringComparison.Ordinal)) >= 0; offset += value.Length)
        {
            count++;
        }
        return count;
    }

    private static void DeleteControlledShaderAssets()
    {
        if (!AssetDatabase.IsValidFolder(ControlledShaderDirectory)) return;
        AssetDatabase.DeleteAsset(ControlledShaderDirectory);
        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
    }

    private static void CreateGrassPatch(Shader shader, ICollection<Material> ownedMaterials)
    {
        var prefabs = new GameObject[GrassPrefabPaths.Length];
        for (var index = 0; index < prefabs.Length; index++)
        {
            prefabs[index] = AssetDatabase.LoadAssetAtPath<GameObject>(GrassPrefabPaths[index]);
            if (prefabs[index] == null) throw new InvalidOperationException($"Grass prefab is missing: {GrassPrefabPaths[index]}");
        }

        var materialCache = new Dictionary<Material, Material>();
        const int columns = 17;
        const int rows = 15;
        const float spacing = 0.72f;
        for (var row = 0; row < rows; row++)
        {
            for (var column = 0; column < columns; column++)
            {
                var type = PositiveHash(column, row) % prefabs.Length;
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefabs[type]);
                instance.name = $"Unity reference grass {column:00}-{row:00}";
                var jitterX = Hash01(column, row, 11) - 0.5f;
                var jitterZ = Hash01(column, row, 29) - 0.5f;
                instance.transform.position = new Vector3(
                    (column - (columns - 1) * 0.5f) * spacing + jitterX * 0.28f,
                    0f,
                    (row - (rows - 1) * 0.5f) * spacing + jitterZ * 0.28f
                );
                instance.transform.rotation = Quaternion.Euler(0f, Hash01(column, row, 47) * 360f, 0f);
                var scale = Mathf.Lerp(0.86f, 1.18f, Hash01(column, row, 71));
                instance.transform.localScale = Vector3.one * scale;

                foreach (var lodGroup in instance.GetComponentsInChildren<LODGroup>(true)) lodGroup.ForceLOD(0);
                foreach (var renderer in instance.GetComponentsInChildren<Renderer>(true))
                {
                    renderer.shadowCastingMode = ShadowCastingMode.Off;
                    var sourceMaterials = renderer.sharedMaterials;
                    for (var materialIndex = 0; materialIndex < sourceMaterials.Length; materialIndex++)
                    {
                        var sourceMaterial = sourceMaterials[materialIndex];
                        if (sourceMaterial == null) continue;
                        if (!materialCache.TryGetValue(sourceMaterial, out var material))
                        {
                            material = new Material(sourceMaterial)
                            {
                                name = sourceMaterial.name + " controlled reference",
                                shader = shader
                            };
                            material.SetFloat("_EnableWind", 1f);
                            material.SetFloat("_WindGrassAmplitude", 1f);
                            material.SetFloat("_WindGrassSpeed", 1f);
                            material.SetFloat("_WindGrassScale", 1f);
                            material.SetFloat("_WindGrassTurbulence", 1f);
                            material.SetFloat("_WindGrassFlexibility", 1f);
                            material.EnableKeyword("_ENABLEWIND_ON");
                            materialCache.Add(sourceMaterial, material);
                            ownedMaterials.Add(material);
                        }
                        sourceMaterials[materialIndex] = material;
                    }
                    renderer.sharedMaterials = sourceMaterials;
                }
            }
        }
    }

    private static int PositiveHash(int x, int y)
    {
        unchecked
        {
            var value = x * 73856093 ^ y * 19349663;
            return value & int.MaxValue;
        }
    }

    private static float Hash01(int x, int y, int salt)
    {
        unchecked
        {
            var value = PositiveHash(x + salt * 17, y + salt * 31);
            value = (value ^ (value >> 13)) * 1274126177;
            return (value & 0x00ffffff) / 16777215f;
        }
    }

    private static Camera CreateCamera()
    {
        var gameObject = new GameObject("Unity grass reference camera");
        var camera = gameObject.AddComponent<Camera>();
        // A cross-wind, low camera makes angular lodging and wave-front travel measurable in
        // screen space instead of hiding both under a high three-quarter view.
        camera.transform.position = new Vector3(0f, 2.75f, -11.4f);
        camera.transform.LookAt(new Vector3(0f, 0.68f, 0.15f), Vector3.up);
        camera.fieldOfView = 42f;
        camera.aspect = (float)Width / Height;
        camera.nearClipPlane = 0.1f;
        camera.farClipPlane = 100f;
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.48f, 0.68f, 0.84f, 1f);
        camera.allowHDR = true;
        return camera;
    }

    private static void CreateGround()
    {
        var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Unity grass reference ground";
        ground.transform.position = new Vector3(0f, -0.025f, 0f);
        ground.transform.localScale = new Vector3(2.2f, 1f, 2.2f);
        var shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null) shader = Shader.Find("Standard");
        var material = new Material(shader) { name = "Unity grass reference ground" };
        material.color = new Color(0.17f, 0.31f, 0.10f, 1f);
        ground.GetComponent<Renderer>().sharedMaterial = material;
    }

    private static void CreateLight()
    {
        var gameObject = new GameObject("Unity grass reference direct light");
        gameObject.transform.rotation = Quaternion.Euler(48f, -32f, 0f);
        var light = gameObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.color = Color.white;
        light.intensity = 1.15f;
        light.shadows = LightShadows.None;
        RenderSettings.ambientMode = AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.58f, 0.62f, 0.66f, 1f);
    }

    private static float ResolveAmplitude(float time)
    {
        if (time <= 1f) return 0.5f;
        if (time < 2.5f) return Mathf.Lerp(0.5f, 5f, Smooth01((time - 1f) / 1.5f));
        if (time <= 3.5f) return 5f;
        if (time < 5.5f) return Mathf.Lerp(5f, 0.5f, Smooth01((time - 3.5f) / 2f));
        return 0.5f;
    }

    private static float Smooth01(float value)
    {
        value = Mathf.Clamp01(value);
        return value * value * (3f - 2f * value);
    }

    private static void ApplyFrameGlobals(float time, float amplitude, Texture2D waveTexture)
    {
        Shader.SetGlobalVector("ASPW_WindDirection", new Vector3(0.8944272f, 0f, 0.4472136f));
        Shader.SetGlobalFloat("ASPW_WindToggle", 1f);
        Shader.SetGlobalFloat("ASPW_WindGrassAmplitude", amplitude);
        Shader.SetGlobalFloat("ASPW_WindGrassSpeed", 1f);
        Shader.SetGlobalFloat("ASPW_WindGrassTurbulence", 1f);
        Shader.SetGlobalFloat("ASPW_WindGrassFlexibility", 3f);
        Shader.SetGlobalFloat("ASPW_WindGrassWavesAmplitude", 1.5f);
        Shader.SetGlobalFloat("ASPW_WindGrassWavesSpeed", 1f);
        Shader.SetGlobalFloat("ASPW_WindGrassWavesScale", 1f);
        Shader.SetGlobalTexture("ASPW_WindGrassWavesNoiseTexture", waveTexture);
        Shader.SetGlobalFloat("_CodexGrassWindTime", time);
        Shader.SetGlobalVector("_TimeParameters", new Vector4(time, Mathf.Sin(time), Mathf.Cos(time), 0f));
        Shader.SetGlobalVector("_Time", new Vector4(time / 20f, time, time * 2f, time * 3f));
        Shader.SetGlobalVector("_SinTime", new Vector4(Mathf.Sin(time / 8f), Mathf.Sin(time / 4f), Mathf.Sin(time / 2f), Mathf.Sin(time)));
        Shader.SetGlobalVector("_CosTime", new Vector4(Mathf.Cos(time / 8f), Mathf.Cos(time / 4f), Mathf.Cos(time / 2f), Mathf.Cos(time)));
        Shader.SetGlobalVector("unity_DeltaTime", new Vector4(1f / FramesPerSecond, FramesPerSecond, 1f / FramesPerSecond, FramesPerSecond));
    }

    private static void RenderFrame(Camera camera, string outputPath)
    {
        var descriptor = new RenderTextureDescriptor(Width, Height, RenderTextureFormat.ARGB32, 24)
        {
            msaaSamples = 1,
            sRGB = true
        };
        var target = new RenderTexture(descriptor);
        target.Create();
        var request = new RenderPipeline.StandardRequest { destination = target };
        if (!RenderPipeline.SupportsRenderRequest(camera, request))
        {
            target.Release();
            UnityEngine.Object.DestroyImmediate(target);
            throw new NotSupportedException("The active render pipeline does not support StandardRequest capture.");
        }
        RenderPipeline.SubmitRenderRequest(camera, request);
        if (outputPath != null)
        {
            var previous = RenderTexture.active;
            RenderTexture.active = target;
            var texture = new Texture2D(Width, Height, TextureFormat.RGBA32, false, false);
            texture.ReadPixels(new Rect(0, 0, Width, Height), 0, 0, false);
            texture.Apply(false, false);
            File.WriteAllBytes(outputPath, texture.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(texture);
            RenderTexture.active = previous;
        }
        target.Release();
        UnityEngine.Object.DestroyImmediate(target);
    }

    private static void Cleanup(IEnumerable<Material> materials)
    {
        foreach (var material in materials)
        {
            if (material != null) UnityEngine.Object.DestroyImmediate(material);
        }
    }
}
