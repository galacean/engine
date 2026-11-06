#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

// Runs in a disposable copy of the purchased project. Only exported data enters the gallery.
public static class RiverValleyExporter
{
    [Serializable] public class SubMesh { public int[] indices; }
    [Serializable] public class MeshData { public string id; public Vector3[] positions; public Vector3[] normals; public Vector4[] tangents; public Vector2[] uv; public Color[] colors; public SubMesh[] subMeshes; }
    [Serializable] public class MaterialData { public string id, name, diffuse, normal; public Color color; public float roughness, cutoff; public bool foliage; }
    [Serializable] public class Instance { public string id, name, mesh; public string[] materials; public Vector3 position, scale, boundsMin, boundsMax; public Quaternion rotation; public int lod; public string lodGroup; public float lodThreshold; }
    [Serializable] public class Layer { public string diffuse, normal; public Vector2 tileSize, tileOffset; public float normalScale, smoothness; }
    [Serializable] public class Detail { public string texture; public Color healthy, dry; public float minWidth, maxWidth, minHeight, maxHeight, noiseSpread; public string renderMode; }
    [Serializable] public class TerrainDataExport { public int detailResolution; public float detailDensity; public Detail[] details; public Vector3 position, size; public int resolution, alphaResolution; public Layer[] layers; }
    [Serializable] public class CameraData { public Vector3 position, forward; public float fov, near, far; }
    [Serializable] public class SunData { public Vector3 forward; public Color color; public float intensity; }
    [Serializable] public class PropertyData { public string name, texture; public float number; public Color color; public Vector4 vector; }
    [Serializable] public class Settings { public string type, json; }
    [Serializable] public class ExportData { public string[] waterKeywords; public PropertyData[] waterProperties; public Settings[] postProcess; public MeshData[] meshes; public MaterialData[] materials; public Instance[] instances; public TerrainDataExport terrain; public MeshData river; public Vector3 riverPosition; public CameraData camera; public SunData sun; public int skySize; public string skyPath; }
    static string Identity(UnityEngine.Object obj) { string guid; long local; AssetDatabase.TryGetGUIDAndLocalFileIdentifier(obj, out guid, out local); return (guid ?? "scene") + "-" + local; }
    static MeshData ReadMesh(Mesh mesh) { return new MeshData { id=Identity(mesh), positions=mesh.vertices, normals=mesh.normals, tangents=mesh.tangents, uv=mesh.uv, colors=mesh.colors, subMeshes=Enumerable.Range(0,mesh.subMeshCount).Select(i=>new SubMesh {indices=mesh.GetIndices(i)}).ToArray() }; }
    static string TexturePath(Material m,string key) { return m.HasProperty(key) ? AssetDatabase.GetAssetPath(m.GetTexture(key)) : ""; }
    static float Number(Material m,string key,float fallback) {return m.HasProperty(key)?m.GetFloat(key):fallback;}
    public static void Export()
    {
        try {
            string[] args=Environment.GetCommandLineArgs(); string output=args[Array.IndexOf(args,"-valleyOutput")+1]; Directory.CreateDirectory(output);
            foreach(string path in AssetDatabase.FindAssets("t:Model",new[]{"Assets/StylizedWater2/_Demo/DemoAssets/Models"}).Select(AssetDatabase.GUIDToAssetPath)) {var importer=AssetImporter.GetAtPath(path) as ModelImporter; if(importer!=null&&!importer.isReadable){importer.isReadable=true;importer.SaveAndReimport();}}
            var scene=EditorSceneManager.OpenScene("Assets/StylizedWater2/_Demo/RiverDemo.unity");
            var roots=scene.GetRootGameObjects(); var meshes=new Dictionary<string,MeshData>(); var materials=new Dictionary<string,MaterialData>(); var instances=new List<Instance>();
            foreach(var renderer in roots.SelectMany(r=>r.GetComponentsInChildren<MeshRenderer>(true))) {
                var filter=renderer.GetComponent<MeshFilter>(); if(filter==null||filter.sharedMesh==null||renderer.name.StartsWith("RiverMesh")||renderer.name=="Lake") continue;
                var mesh=filter.sharedMesh; string meshId=Identity(mesh); if(!meshes.ContainsKey(meshId))meshes.Add(meshId,ReadMesh(mesh));
                foreach(var mat in renderer.sharedMaterials) {if(mat==null||materials.ContainsKey(Identity(mat)))continue; bool foliage=mat.name.Contains("Branch")||mat.name.Contains("Shrub")||mat.name.Contains("Grass")||mat.shader.name.Contains("Foliage"); materials.Add(Identity(mat),new MaterialData {id=Identity(mat),name=mat.name,diffuse=TexturePath(mat,"_BaseMap"),normal=TexturePath(mat,"_BumpMap"),color=mat.HasProperty("_BaseColor")?mat.GetColor("_BaseColor"):Color.white,roughness=1-Number(mat,"_Smoothness",0),cutoff=foliage?Number(mat,"_Cutoff",0.5f):0,foliage=foliage});}
                int lod=0; float threshold=0; var group=renderer.GetComponentInParent<LODGroup>(); if(group!=null){var levels=group.GetLODs();for(int i=0;i<levels.Length;i++)if(levels[i].renderers.Contains(renderer)){lod=i;threshold=levels[i].screenRelativeTransitionHeight;}}
                var tr=renderer.transform; instances.Add(new Instance {id=GlobalObjectId.GetGlobalObjectIdSlow(renderer).ToString(),name=renderer.name,mesh=meshId,materials=renderer.sharedMaterials.Select(Identity).ToArray(),position=tr.position,rotation=tr.rotation,scale=tr.lossyScale,boundsMin=renderer.bounds.min,boundsMax=renderer.bounds.max,lod=lod,lodGroup=group==null?"":GlobalObjectId.GetGlobalObjectIdSlow(group).ToString(),lodThreshold=threshold});
            }
            var terrain=roots.SelectMany(r=>r.GetComponentsInChildren<Terrain>()).First(); var td=terrain.terrainData;
            var heights=td.GetHeights(0,0,td.heightmapResolution,td.heightmapResolution); using(var w=new BinaryWriter(File.Create(Path.Combine(output,"heights.f32"))))for(int z=0;z<td.heightmapResolution;z++)for(int x=0;x<td.heightmapResolution;x++)w.Write(terrain.transform.position.y+heights[z,x]*td.size.y);
            var alphas=td.GetAlphamaps(0,0,td.alphamapResolution,td.alphamapResolution);using(var w=new BinaryWriter(File.Create(Path.Combine(output,"alphas.f32"))))for(int z=0;z<td.alphamapResolution;z++)for(int x=0;x<td.alphamapResolution;x++)for(int l=0;l<td.terrainLayers.Length;l++)w.Write(alphas[z,x,l]);
            using(var w=new BinaryWriter(File.Create(Path.Combine(output,"details.u16"))))for(int l=0;l<td.detailPrototypes.Length;l++){var density=td.GetDetailLayer(0,0,td.detailResolution,td.detailResolution,l);for(int z=0;z<td.detailResolution;z++)for(int x=0;x<td.detailResolution;x++)w.Write((ushort)density[z,x]);}
            var river=roots.SelectMany(r=>r.GetComponentsInChildren<MeshFilter>()).First(r=>r.name.StartsWith("RiverMesh"));
            var camera=roots.SelectMany(r=>r.GetComponentsInChildren<Camera>()).First(); var sun=RenderSettings.sun;
            var skyPath=AssetDatabase.GetAssetPath(RenderSettings.skybox.GetTexture("_Tex")); var skyImporter=(TextureImporter)AssetImporter.GetAtPath(skyPath);skyImporter.isReadable=true;skyImporter.SaveAndReimport();var sky=AssetDatabase.LoadAssetAtPath<Cubemap>(skyPath); const int skySize=256;
            using(var w=new BinaryWriter(File.Create(Path.Combine(output,"sky.f32"))))for(int f=0;f<6;f++)for(int y=0;y<skySize;y++)for(int x=0;x<skySize;x++){var c=sky.GetPixel((CubemapFace)f,Math.Min(sky.width-1,(int)((x+.5f)*sky.width/skySize)),Math.Min(sky.width-1,(int)((y+.5f)*sky.width/skySize)));w.Write(c.r);w.Write(c.g);w.Write(c.b);w.Write(c.a);}
            var waterMaterial=river.GetComponent<MeshRenderer>().sharedMaterial;
            var waterProperties=new List<PropertyData>();for(int i=0;i<ShaderUtil.GetPropertyCount(waterMaterial.shader);i++){var name=ShaderUtil.GetPropertyName(waterMaterial.shader,i);var property=new PropertyData {name=name};switch(ShaderUtil.GetPropertyType(waterMaterial.shader,i)){case ShaderUtil.ShaderPropertyType.Color:property.color=waterMaterial.GetColor(name);break;case ShaderUtil.ShaderPropertyType.Vector:property.vector=waterMaterial.GetVector(name);break;case ShaderUtil.ShaderPropertyType.TexEnv:property.texture=TexturePath(waterMaterial,name);break;default:property.number=waterMaterial.GetFloat(name);break;}waterProperties.Add(property);}
            var volumes=roots.SelectMany(r=>r.GetComponentsInChildren<UnityEngine.Rendering.Volume>(true));
            var result=new ExportData {waterKeywords=waterMaterial.shaderKeywords,waterProperties=waterProperties.ToArray(),postProcess=volumes.Where(v=>v.sharedProfile!=null).SelectMany(v=>v.sharedProfile.components).Select(c=>new Settings{type=c.GetType().FullName,json=EditorJsonUtility.ToJson(c)}).ToArray(),meshes=meshes.Values.OrderBy(m=>m.id).ToArray(),materials=materials.Values.OrderBy(m=>m.id).ToArray(),instances=instances.OrderBy(i=>i.id).ToArray(),terrain=new TerrainDataExport {detailResolution=td.detailResolution,detailDensity=terrain.detailObjectDensity,details=td.detailPrototypes.Select(d=>new Detail {texture=AssetDatabase.GetAssetPath(d.prototypeTexture),healthy=d.healthyColor,dry=d.dryColor,minWidth=d.minWidth,maxWidth=d.maxWidth,minHeight=d.minHeight,maxHeight=d.maxHeight,noiseSpread=d.noiseSpread,renderMode=d.renderMode.ToString()}).ToArray(),position=terrain.transform.position,size=td.size,resolution=td.heightmapResolution,alphaResolution=td.alphamapResolution,layers=td.terrainLayers.Select(l=>new Layer {diffuse=AssetDatabase.GetAssetPath(l.diffuseTexture),normal=AssetDatabase.GetAssetPath(l.normalMapTexture),tileSize=l.tileSize,tileOffset=l.tileOffset,normalScale=l.normalScale,smoothness=l.smoothness}).ToArray()},river=ReadMesh(river.sharedMesh),riverPosition=river.transform.position,camera=new CameraData {position=camera.transform.position,forward=camera.transform.forward,fov=camera.fieldOfView,near=camera.nearClipPlane,far=camera.farClipPlane},sun=new SunData {forward=sun.transform.forward,color=sun.color,intensity=sun.intensity},skySize=skySize,skyPath=skyPath};
            File.WriteAllText(Path.Combine(output,"scene.json"),JsonUtility.ToJson(result)); Debug.Log("RIVER_VALLEY_EXPORT_COMPLETE "+output); EditorApplication.Exit(0);
        } catch(Exception e){Debug.LogException(e);EditorApplication.Exit(1);}
    }
}
#endif
