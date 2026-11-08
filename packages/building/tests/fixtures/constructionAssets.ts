import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BufferMesh, Texture2D, Texture2DArray, TextureCube, MeshRenderer } from "@galacean/engine-core";
import { PrefabResource, parseBufferMeshData, parseTexturePixelsData } from "@galacean/engine-loader";
import { buildingAssets, BuildingAssetKitComponent, BuildingUnitComponent, BuildingAssemblyComponent, BuildingPrefabComponent, BuildingUnitMemberComponent } from "../../src/building/resources/BuildingAssetKit";
const root=process.env.BUILDING_TEST_ASSETS ?? fileURLToPath(new URL("../../src/building/assets/native/", import.meta.url)),prefix="Building/Units/";
const json=(path:string)=>JSON.parse(readFileSync(root+path.slice(prefix.length),"utf8"));
/** CPU tests replace GPU allocation only. Inputs and native decoding are the same
 * Prefab/Mesh/Material/Texture files loaded by the browser regression. */
export function constructionAssets(editMesh?:(path:string,bytes:Uint8Array)=>Uint8Array):PrefabResource {
  const cache=new Map<string,any>();
  const native=(path:string):any=>{
    if(cache.has(path))return cache.get(path);
    let value:any;
    if(path.endsWith(".mesh")){
      const original=Uint8Array.from(readFileSync(root+path.slice(prefix.length)));
      const {data,vertices,indexBytes}=parseBufferMeshData((editMesh?editMesh(path,original):original).buffer as ArrayBuffer);
      value=Object.create(BufferMesh.prototype);
      const fields={vertexElements:data.vertexElements,vertexBufferBindings:data.vertexBuffers.map((b,i)=>({stride:b.stride,buffer:{data:vertices[i]}})),
        indexBufferBinding:{format:data.indices.format,buffer:{data:indexBytes}},subMeshes:data.subMeshes,bounds:data.bounds};
      for(const [key,v] of Object.entries(fields))Object.defineProperty(value,key,{value:v});
    }else if(path.endsWith(".tex")){
      const {data}=parseTexturePixelsData(Uint8Array.from(readFileSync(root+path.slice(prefix.length))).buffer);
      value=Object.create((data.dimension==="cube"?TextureCube:data.dimension==="2d-array"?Texture2DArray:Texture2D).prototype);
      for(const [key,v] of Object.entries({width:data.width,height:data.height,length:data.layers,isSRGBColorSpace:data.srgb}))Object.defineProperty(value,key,{value:v});
    }else if(path.endsWith(".mat")){
      const material=json(path),shader=json(material.shaderRef.url);
      value={instanceId:cache.size+1,shader:{subShaders:[{passes:[{_vertexShaderInstructions:shader.subShaders[0].passes[0].vertexShaderInstructions,
        _fragmentShaderInstructions:shader.subShaders[0].passes[0].fragmentShaderInstructions}]}]},shaderData:{getTexture:(name:string)=>material.shaderData[name]?.type==="Texture"?native(material.shaderData[name].value.url):null}};
    }else if(path.endsWith(".prefab")){
      const source=json(path);
      const resolve=(value:any):any=>value&&typeof value==="object"?(value.$ref?native(value.$ref):Array.isArray(value)?value.map(resolve):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v)]))):value;
      const instantiate=(id:string,parent=new Matrix()):any=>{
        const e=source.entities.find((e:any)=>e.id===id),members=source.components.filter((c:any)=>e.components?.includes(c.id));
        const vector=(v:number[]|undefined,d:number[])=>new Vector3(...(v??d) as [number,number,number]);
        const scale=vector(e.scale,[1,1,1]),rotation=vector(e.rotation,[0,0,0]),q=new Quaternion(),local=new Matrix(),world=new Matrix();
        Quaternion.rotationEuler(rotation.x*Math.PI/180,rotation.y*Math.PI/180,rotation.z*Math.PI/180,q);
        Matrix.affineTransformation(scale,q,vector(e.position,[0,0,0]),local);Matrix.multiply(parent,local,world);
        return {name:e.name,isActive:e.isActive!==false,transform:{localMatrix:local,worldMatrix:world,scale},children:(e.children??[]).map((id:string)=>instantiate(id,world)),getComponent(type:unknown){
          const name=type===BuildingAssetKitComponent?"BuildingAssetKitComponent":type===BuildingUnitComponent?"BuildingUnitComponent":type===BuildingAssemblyComponent?"BuildingAssemblyComponent":type===BuildingPrefabComponent?"BuildingPrefabComponent":type===BuildingUnitMemberComponent?"BuildingUnitMemberComponent":type===MeshRenderer?"MeshRenderer":"";
          const config=members.find((c:any)=>c.type===name);if(!config)return null;
          if(type===MeshRenderer)return {enabled:config.props?.enabled!==false,mesh:native(config.props.mesh.$ref),getMaterial:()=>native(config.calls[0].args[0].$ref)};
          return {enabled:true,assemblies:{},family:"",instanceStride:0,directInstances:false,bindings:{},attributeLocations:{},integerAttributes:[],textureSlots:{},doubleSided:false,lodMesh:null,sdfMaterial:null,stoneFrame:null,attachment:"body",surfaceKind:0,openings:[],curvedNarrowing:0,roofProfile:[],unit:null,span:null,...resolve(config.props)};
        },destroy(){}};
      };
      value=Object.create(PrefabResource.prototype);
      Object.assign(value,{_destroyed:false,_refCount:0,instanceId:cache.size+1,_addReferCount(delta:number){this._refCount+=delta;},destroy(){this._destroyed=true;},instantiate:()=>instantiate(source.root)});
    }else throw Error("Unsupported native fixture asset: "+path);
    cache.set(path,value);return value;
  };
  return native(prefix+"building-kit.prefab");
}
export const nativeAssets=buildingAssets(constructionAssets());
