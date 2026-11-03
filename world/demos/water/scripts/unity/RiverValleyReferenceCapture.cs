#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Captures the original scene in the disposable export project, never the purchased project.
public static class RiverValleyReferenceCapture
{
    static string output;
    static Camera camera;
    static int index;
    static double next;
    static RenderTexture target;
    static readonly string[] Names={"original-full","upstream-full","cascade-full","downstream-full","overview","upstream","cascade","downstream"};
    static readonly Vector3[] Positions={new Vector3(-29.71f,18.12f,50.27f),new Vector3(3,24,63),new Vector3(-26,12,55),new Vector3(-57,7,32),new Vector3(-29.71f,18.12f,50.27f),new Vector3(3,24,63),new Vector3(-26,12,55),new Vector3(-57,7,32)};
    static readonly Vector3[] Targets={new Vector3(4,2.8f,82),new Vector3(26,15,81),new Vector3(0,6,75),new Vector3(-37,-.5f,62),new Vector3(4,2.8f,82),new Vector3(26,15,81),new Vector3(0,6,75),new Vector3(-37,-.5f,62)};
    static readonly float[] Fovs={38.3f,45,45,48,38.3f,45,45,48};
    public static void Capture()
    {
        var args=Environment.GetCommandLineArgs();output=args[Array.IndexOf(args,"-valleyOutput")+1];Directory.CreateDirectory(output);
        EditorSceneManager.OpenScene("Assets/StylizedWater2/_Demo/RiverDemo.unity");camera=UnityEngine.Object.FindObjectOfType<Camera>();
        foreach(var renderer in UnityEngine.Object.FindObjectsOfType<MeshRenderer>())if(renderer.name.StartsWith("RiverMesh")){renderer.sharedMaterial=new Material(renderer.sharedMaterial);renderer.sharedMaterial.SetFloat("_Speed",0);}
        target=new RenderTexture(1280,720,24,RenderTextureFormat.ARGB32);camera.targetTexture=target;
        next=EditorApplication.timeSinceStartup+8;EditorApplication.update+=Update;
    }
    static void Update()
    {
        if(EditorApplication.timeSinceStartup<next)return;
        try {
            if(index==4){GameObject.Find("VFX")?.SetActive(false);GameObject.Find("Lake")?.SetActive(false);foreach(var r in UnityEngine.Object.FindObjectsOfType<MeshRenderer>())if(r.name.StartsWith("RiverMesh")){r.sharedMaterial=new Material(r.sharedMaterial);r.sharedMaterial.DisableKeyword("_CAUSTICS");}}
            camera.transform.position=Positions[index];camera.transform.LookAt(Targets[index]);camera.fieldOfView=Fovs[index];
            Shader.SetGlobalVector("_Time",new Vector4(.5f,10,20,30));
            camera.Render();
            var previous=RenderTexture.active;RenderTexture.active=target;var texture=new Texture2D(1280,720,TextureFormat.RGBA32,false);texture.ReadPixels(new Rect(0,0,1280,720),0,0);texture.Apply();File.WriteAllBytes(Path.Combine(output,Names[index]+".png"),texture.EncodeToPNG());RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(texture);
            Debug.Log("RIVER_REFERENCE_CAPTURE "+Names[index]);index++;next=EditorApplication.timeSinceStartup+2;
            if(index==Names.Length){EditorApplication.update-=Update;camera.targetTexture=null;target.Release();UnityEngine.Object.DestroyImmediate(target);EditorApplication.Exit(0);}
        }catch(Exception e){Debug.LogException(e);EditorApplication.Exit(1);}
    }
}
#endif
