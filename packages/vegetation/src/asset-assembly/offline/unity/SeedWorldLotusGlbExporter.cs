#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

/// <summary>
/// Isolated, dependency-free Unity Editor exporter for the licensed Grasslands lotus Prefabs.
/// The script is copied into a temporary Unity project by export-seed-world-lotus.mjs; it never
/// needs to be installed in the purchased source project.
/// </summary>
public static class SeedWorldLotusGlbExporter
{
    private const uint GlbMagic = 0x46546C67;
    private const uint JsonChunkType = 0x4E4F534A;
    private const uint BinaryChunkType = 0x004E4942;

    private sealed class Variant
    {
        public readonly string Id;
        public readonly string PrefabPath;

        public Variant(string id, string prefabPath)
        {
            Id = id;
            PrefabPath = prefabPath;
        }
    }

    private sealed class BufferViewRecord
    {
        public int Offset;
        public int Length;
        public int? Target;
    }

    private sealed class AccessorRecord
    {
        public int BufferView;
        public int ComponentType;
        public int Count;
        public string Type;
        public bool Normalized;
        public float[] Minimum;
        public float[] Maximum;
    }

    private sealed class PrimitiveRecord
    {
        public int Position;
        public int Normal;
        public int? Tangent;
        public int? Texcoord;
        public int? Color;
        public int Indices;
        public string MaterialName;
    }

    private sealed class LodMetadata
    {
        public string FileName;
        public string SourceObjectName;
        public float ScreenRelativeHeight;
        public int VertexCount;
        public int TriangleCount;
        public int PrimitiveCount;
        public string[] MaterialSlots;
        public Vector3 Minimum;
        public Vector3 Maximum;
    }

    private sealed class VariantMetadata
    {
        public string Id;
        public string PrefabPath;
        public Vector3 LocalReferencePoint;
        public float Size;
        public LodMetadata[] Lods;
    }

    private static readonly Variant[] Variants =
    {
        new Variant("lotus", "Assets/LotusSource/Prefabs/Vegetation/Lotus.prefab"),
        new Variant("lotus-group-1", "Assets/LotusSource/Prefabs/Vegetation/Lotus_Group_1.prefab"),
        new Variant("lotus-group-2", "Assets/LotusSource/Prefabs/Vegetation/Lotus_Group_2.prefab")
    };

    public static void Export()
    {
        try
        {
            string outputDirectory = RequireArgument("-lotusOutputPath");
            Directory.CreateDirectory(outputDirectory);
            MakeModelMeshesReadable();
            var metadata = new List<VariantMetadata>();
            foreach (Variant variant in Variants)
            {
                metadata.Add(ExportVariant(variant, outputDirectory));
            }
            File.WriteAllText(Path.Combine(outputDirectory, "unity-export.json"), BuildMetadataJson(metadata), new UTF8Encoding(false));
            Debug.Log("SEED_WORLD_LOTUS_EXPORT_COMPLETE " + outputDirectory);
            EditorApplication.Exit(0);
        }
        catch (Exception error)
        {
            Debug.LogException(error);
            EditorApplication.Exit(1);
        }
    }

    private static string RequireArgument(string key)
    {
        string[] arguments = Environment.GetCommandLineArgs();
        int index = Array.IndexOf(arguments, key);
        if (index < 0 || index + 1 >= arguments.Length || string.IsNullOrWhiteSpace(arguments[index + 1]))
        {
            throw new ArgumentException("Missing required Unity argument " + key);
        }
        return Path.GetFullPath(arguments[index + 1]);
    }

    private static void MakeModelMeshesReadable()
    {
        foreach (string modelPath in AssetDatabase.FindAssets("t:Model", new[] { "Assets/LotusSource/Models" })
                     .Select(AssetDatabase.GUIDToAssetPath))
        {
            var importer = AssetImporter.GetAtPath(modelPath) as ModelImporter;
            if (importer == null || importer.isReadable) continue;
            importer.isReadable = true;
            importer.SaveAndReimport();
        }
    }

    private static VariantMetadata ExportVariant(Variant variant, string outputDirectory)
    {
        GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(variant.PrefabPath);
        if (prefab == null) throw new InvalidOperationException("Missing lotus Prefab " + variant.PrefabPath);
        LODGroup lodGroup = prefab.GetComponent<LODGroup>();
        if (lodGroup == null) throw new InvalidOperationException("Lotus Prefab has no root LODGroup: " + variant.PrefabPath);
        LOD[] lods = lodGroup.GetLODs();
        if (lods.Length != 2) throw new InvalidOperationException("Lotus Prefab must contain exactly two LODs: " + variant.PrefabPath);

        var outputLods = new List<LodMetadata>();
        for (int lodIndex = 0; lodIndex < lods.Length; lodIndex++)
        {
            Renderer[] renderers = lods[lodIndex].renderers.Where(renderer => renderer != null).ToArray();
            if (renderers.Length != 1 || !(renderers[0] is MeshRenderer))
            {
                throw new InvalidOperationException("Lotus LOD must contain exactly one static MeshRenderer: " + variant.PrefabPath);
            }
            var meshFilter = renderers[0].GetComponent<MeshFilter>();
            Mesh mesh = meshFilter != null ? meshFilter.sharedMesh : null;
            if (mesh == null) throw new InvalidOperationException("Lotus LOD has no static Mesh: " + variant.PrefabPath);
            Matrix4x4 relativeTransform = prefab.transform.worldToLocalMatrix * renderers[0].transform.localToWorldMatrix;
            string fileName = variant.Id + "-lod" + lodIndex.ToString(CultureInfo.InvariantCulture) + ".glb";
            LodMetadata lodMetadata = ExportMesh(
                mesh,
                renderers[0],
                relativeTransform,
                Path.Combine(outputDirectory, fileName),
                variant.Id + " LOD" + lodIndex.ToString(CultureInfo.InvariantCulture)
            );
            lodMetadata.FileName = fileName;
            lodMetadata.SourceObjectName = renderers[0].name;
            lodMetadata.ScreenRelativeHeight = lods[lodIndex].screenRelativeTransitionHeight;
            outputLods.Add(lodMetadata);
        }
        return new VariantMetadata
        {
            Id = variant.Id,
            PrefabPath = variant.PrefabPath,
            LocalReferencePoint = ToGltfPosition(lodGroup.localReferencePoint),
            Size = lodGroup.size,
            Lods = outputLods.ToArray()
        };
    }

    private static LodMetadata ExportMesh(
        Mesh mesh,
        Renderer renderer,
        Matrix4x4 relativeTransform,
        string outputPath,
        string meshName)
    {
        Vector3[] sourcePositions = mesh.vertices;
        Vector3[] sourceNormals = mesh.normals;
        Vector4[] sourceTangents = mesh.tangents;
        Vector2[] sourceUv = mesh.uv;
        Color32[] sourceColors = mesh.colors32;
        if (sourcePositions.Length == 0 || sourceNormals.Length != sourcePositions.Length)
        {
            throw new InvalidOperationException(meshName + " must contain matching positions and normals");
        }
        bool hasTangents = sourceTangents.Length == sourcePositions.Length;
        bool hasUv = sourceUv.Length == sourcePositions.Length;
        bool hasColors = sourceColors.Length == sourcePositions.Length;

        Matrix4x4 normalTransform = relativeTransform.inverse.transpose;
        var positions = new Vector3[sourcePositions.Length];
        var normals = new Vector3[sourcePositions.Length];
        var tangents = hasTangents ? new Vector4[sourcePositions.Length] : null;
        Vector3 minimum = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        Vector3 maximum = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        for (int index = 0; index < sourcePositions.Length; index++)
        {
            Vector3 position = ToGltfPosition(relativeTransform.MultiplyPoint3x4(sourcePositions[index]));
            Vector3 normal = ToGltfDirection(normalTransform.MultiplyVector(sourceNormals[index]).normalized);
            positions[index] = position;
            normals[index] = normal;
            minimum = Vector3.Min(minimum, position);
            maximum = Vector3.Max(maximum, position);
            if (hasTangents)
            {
                Vector4 source = sourceTangents[index];
                Vector3 direction = ToGltfDirection(relativeTransform.MultiplyVector(new Vector3(source.x, source.y, source.z)).normalized);
                // The Z-axis handedness conversion and the Unity-bottom-left to glTF-top-left UV conversion
                // each invert the tangent basis. Together they preserve the authored tangent handedness.
                tangents[index] = new Vector4(direction.x, direction.y, direction.z, source.w);
            }
        }

        var binary = new MemoryStream();
        var views = new List<BufferViewRecord>();
        var accessors = new List<AccessorRecord>();
        int positionAccessor = AppendFloatVectors(binary, views, accessors, positions.Select(value => new[] { value.x, value.y, value.z }), "VEC3", 34962, minimum, maximum);
        int normalAccessor = AppendFloatVectors(binary, views, accessors, normals.Select(value => new[] { value.x, value.y, value.z }), "VEC3", 34962, null, null);
        int? tangentAccessor = hasTangents
            ? (int?)AppendFloatVectors(binary, views, accessors, tangents.Select(value => new[] { value.x, value.y, value.z, value.w }), "VEC4", 34962, null, null)
            : null;
        int? uvAccessor = hasUv
            ? (int?)AppendFloatVectors(binary, views, accessors, sourceUv.Select(value => new[] { value.x, 1.0f - value.y }), "VEC2", 34962, null, null)
            : null;
        int? colorAccessor = hasColors ? (int?)AppendColors(binary, views, accessors, sourceColors) : null;

        Material[] materials = renderer.sharedMaterials;
        var primitives = new List<PrimitiveRecord>();
        int triangleCount = 0;
        for (int subMesh = 0; subMesh < mesh.subMeshCount; subMesh++)
        {
            int[] indices = mesh.GetTriangles(subMesh, true);
            for (int triangle = 0; triangle + 2 < indices.Length; triangle += 3)
            {
                int swap = indices[triangle + 1];
                indices[triangle + 1] = indices[triangle + 2];
                indices[triangle + 2] = swap;
            }
            int indexAccessor = AppendIndices(binary, views, accessors, indices, sourcePositions.Length > ushort.MaxValue);
            triangleCount += indices.Length / 3;
            string materialName = subMesh < materials.Length && materials[subMesh] != null
                ? materials[subMesh].name
                : "material-slot-" + subMesh.ToString(CultureInfo.InvariantCulture);
            primitives.Add(new PrimitiveRecord
            {
                Position = positionAccessor,
                Normal = normalAccessor,
                Tangent = tangentAccessor,
                Texcoord = uvAccessor,
                Color = colorAccessor,
                Indices = indexAccessor,
                MaterialName = materialName
            });
        }

        byte[] binaryBytes = binary.ToArray();
        string json = BuildGltfJson(meshName, binaryBytes.Length, views, accessors, primitives);
        WriteGlb(outputPath, json, binaryBytes);
        return new LodMetadata
        {
            VertexCount = sourcePositions.Length,
            TriangleCount = triangleCount,
            PrimitiveCount = primitives.Count,
            MaterialSlots = primitives.Select(primitive => primitive.MaterialName).ToArray(),
            Minimum = minimum,
            Maximum = maximum
        };
    }

    private static Vector3 ToGltfPosition(Vector3 value)
    {
        return new Vector3(value.x, value.y, -value.z);
    }

    private static Vector3 ToGltfDirection(Vector3 value)
    {
        return new Vector3(value.x, value.y, -value.z);
    }

    private static int AppendFloatVectors(
        MemoryStream binary,
        List<BufferViewRecord> views,
        List<AccessorRecord> accessors,
        IEnumerable<float[]> values,
        string type,
        int target,
        Vector3? minimum,
        Vector3? maximum)
    {
        Align(binary, 4);
        int offset = checked((int)binary.Position);
        int count = 0;
        using (var writer = new BinaryWriter(binary, Encoding.UTF8, true))
        {
            foreach (float[] value in values)
            {
                foreach (float component in value) writer.Write(component);
                count++;
            }
        }
        int view = views.Count;
        views.Add(new BufferViewRecord { Offset = offset, Length = checked((int)binary.Position) - offset, Target = target });
        int accessor = accessors.Count;
        accessors.Add(new AccessorRecord
        {
            BufferView = view,
            ComponentType = 5126,
            Count = count,
            Type = type,
            Minimum = minimum.HasValue ? new[] { minimum.Value.x, minimum.Value.y, minimum.Value.z } : null,
            Maximum = maximum.HasValue ? new[] { maximum.Value.x, maximum.Value.y, maximum.Value.z } : null
        });
        return accessor;
    }

    private static int AppendColors(
        MemoryStream binary,
        List<BufferViewRecord> views,
        List<AccessorRecord> accessors,
        Color32[] colors)
    {
        Align(binary, 4);
        int offset = checked((int)binary.Position);
        foreach (Color32 color in colors)
        {
            binary.WriteByte(color.r);
            binary.WriteByte(color.g);
            binary.WriteByte(color.b);
            binary.WriteByte(color.a);
        }
        int view = views.Count;
        views.Add(new BufferViewRecord { Offset = offset, Length = checked((int)binary.Position) - offset, Target = 34962 });
        int accessor = accessors.Count;
        accessors.Add(new AccessorRecord
        {
            BufferView = view,
            ComponentType = 5121,
            Count = colors.Length,
            Type = "VEC4",
            Normalized = true
        });
        return accessor;
    }

    private static int AppendIndices(
        MemoryStream binary,
        List<BufferViewRecord> views,
        List<AccessorRecord> accessors,
        int[] indices,
        bool useUint32)
    {
        Align(binary, 4);
        int offset = checked((int)binary.Position);
        using (var writer = new BinaryWriter(binary, Encoding.UTF8, true))
        {
            foreach (int index in indices)
            {
                if (useUint32) writer.Write((uint)index);
                else writer.Write((ushort)index);
            }
        }
        int view = views.Count;
        views.Add(new BufferViewRecord { Offset = offset, Length = checked((int)binary.Position) - offset, Target = 34963 });
        int accessor = accessors.Count;
        accessors.Add(new AccessorRecord
        {
            BufferView = view,
            ComponentType = useUint32 ? 5125 : 5123,
            Count = indices.Length,
            Type = "SCALAR"
        });
        return accessor;
    }

    private static string BuildGltfJson(
        string meshName,
        int binaryLength,
        List<BufferViewRecord> views,
        List<AccessorRecord> accessors,
        List<PrimitiveRecord> primitives)
    {
        var json = new StringBuilder();
        json.Append("{\"asset\":{\"version\":\"2.0\",\"generator\":\"Seed World isolated Unity lotus exporter\"},");
        json.Append("\"buffers\":[{\"byteLength\":").Append(binaryLength).Append("}],");
        json.Append("\"bufferViews\":[");
        for (int index = 0; index < views.Count; index++)
        {
            if (index > 0) json.Append(',');
            BufferViewRecord view = views[index];
            json.Append("{\"buffer\":0,\"byteOffset\":").Append(view.Offset)
                .Append(",\"byteLength\":").Append(view.Length);
            if (view.Target.HasValue) json.Append(",\"target\":").Append(view.Target.Value);
            json.Append('}');
        }
        json.Append("],\"accessors\":[");
        for (int index = 0; index < accessors.Count; index++)
        {
            if (index > 0) json.Append(',');
            AccessorRecord accessor = accessors[index];
            json.Append("{\"bufferView\":").Append(accessor.BufferView)
                .Append(",\"componentType\":").Append(accessor.ComponentType)
                .Append(",\"count\":").Append(accessor.Count)
                .Append(",\"type\":\"").Append(accessor.Type).Append('\"');
            if (accessor.Normalized) json.Append(",\"normalized\":true");
            if (accessor.Minimum != null) json.Append(",\"min\":").Append(FloatArrayJson(accessor.Minimum));
            if (accessor.Maximum != null) json.Append(",\"max\":").Append(FloatArrayJson(accessor.Maximum));
            json.Append('}');
        }
        json.Append("],\"meshes\":[{\"name\":\"").Append(Escape(meshName)).Append("\",\"primitives\":[");
        for (int index = 0; index < primitives.Count; index++)
        {
            if (index > 0) json.Append(',');
            PrimitiveRecord primitive = primitives[index];
            json.Append("{\"attributes\":{\"POSITION\":").Append(primitive.Position)
                .Append(",\"NORMAL\":").Append(primitive.Normal);
            if (primitive.Tangent.HasValue) json.Append(",\"TANGENT\":").Append(primitive.Tangent.Value);
            if (primitive.Texcoord.HasValue) json.Append(",\"TEXCOORD_0\":").Append(primitive.Texcoord.Value);
            if (primitive.Color.HasValue) json.Append(",\"COLOR_0\":").Append(primitive.Color.Value);
            json.Append("},\"indices\":").Append(primitive.Indices).Append('}');
        }
        json.Append("]}],\"nodes\":[{\"name\":\"").Append(Escape(meshName)).Append("\",\"mesh\":0}],")
            .Append("\"scenes\":[{\"name\":\"Scene\",\"nodes\":[0]}],\"scene\":0}");
        return json.ToString();
    }

    private static void WriteGlb(string path, string json, byte[] binary)
    {
        byte[] jsonBytes = Encoding.UTF8.GetBytes(json);
        int paddedJsonLength = Align4(jsonBytes.Length);
        int paddedBinaryLength = Align4(binary.Length);
        int totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinaryLength;
        using (var stream = File.Create(path))
        using (var writer = new BinaryWriter(stream))
        {
            writer.Write(GlbMagic);
            writer.Write(2u);
            writer.Write((uint)totalLength);
            writer.Write((uint)paddedJsonLength);
            writer.Write(JsonChunkType);
            writer.Write(jsonBytes);
            for (int index = jsonBytes.Length; index < paddedJsonLength; index++) writer.Write((byte)0x20);
            writer.Write((uint)paddedBinaryLength);
            writer.Write(BinaryChunkType);
            writer.Write(binary);
            for (int index = binary.Length; index < paddedBinaryLength; index++) writer.Write((byte)0);
        }
    }

    private static string BuildMetadataJson(IEnumerable<VariantMetadata> variants)
    {
        var json = new StringBuilder("{\n  \"schemaVersion\": 1,\n  \"variants\": [\n");
        int variantIndex = 0;
        foreach (VariantMetadata variant in variants)
        {
            if (variantIndex++ > 0) json.Append(",\n");
            json.Append("    {\n      \"id\": \"").Append(Escape(variant.Id)).Append("\",\n")
                .Append("      \"prefabPath\": \"").Append(Escape(variant.PrefabPath)).Append("\",\n")
                .Append("      \"localReferencePoint\": ").Append(VectorJson(variant.LocalReferencePoint)).Append(",\n")
                .Append("      \"size\": ").Append(FloatJson(variant.Size)).Append(",\n")
                .Append("      \"lods\": [\n");
            for (int lodIndex = 0; lodIndex < variant.Lods.Length; lodIndex++)
            {
                if (lodIndex > 0) json.Append(",\n");
                LodMetadata lod = variant.Lods[lodIndex];
                json.Append("        {\"fileName\": \"").Append(Escape(lod.FileName))
                    .Append("\", \"sourceObjectName\": \"").Append(Escape(lod.SourceObjectName))
                    .Append("\", \"screenRelativeHeight\": ").Append(FloatJson(lod.ScreenRelativeHeight))
                    .Append(", \"vertices\": ").Append(lod.VertexCount)
                    .Append(", \"triangles\": ").Append(lod.TriangleCount)
                    .Append(", \"primitiveCount\": ").Append(lod.PrimitiveCount)
                    .Append(", \"materialSlots\": [")
                    .Append(string.Join(", ", lod.MaterialSlots.Select(slot => "\"" + Escape(slot) + "\"")))
                    .Append("], \"bounds\": {\"minimum\": ").Append(VectorJson(lod.Minimum))
                    .Append(", \"maximum\": ").Append(VectorJson(lod.Maximum)).Append("}}");
            }
            json.Append("\n      ]\n    }");
        }
        json.Append("\n  ]\n}\n");
        return json.ToString();
    }

    private static string VectorJson(Vector3 value)
    {
        return "[" + FloatJson(value.x) + ", " + FloatJson(value.y) + ", " + FloatJson(value.z) + "]";
    }

    private static string FloatArrayJson(IEnumerable<float> values)
    {
        return "[" + string.Join(",", values.Select(FloatJson)) + "]";
    }

    private static string FloatJson(float value)
    {
        return value.ToString("R", CultureInfo.InvariantCulture);
    }

    private static string Escape(string value)
    {
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    private static void Align(MemoryStream stream, int alignment)
    {
        while (stream.Position % alignment != 0) stream.WriteByte(0);
    }

    private static int Align4(int value)
    {
        return (value + 3) & ~3;
    }
}
#endif
