import { FileHeader, parseBufferMeshData } from "@galacean/engine-loader";
/** Test-only asset editing: preserve native encoding and recompute bounds after a vertex edit. */
export function editNativeMesh(content: Uint8Array, attribute: string, mutate:(value:number,axis:number)=>number): Uint8Array {
  const buffer=Uint8Array.from(content).buffer,header=FileHeader.decode(buffer),view=new DataView(buffer);
  const {data,vertices}=parseBufferMeshData(buffer);
  const element=data.vertexElements.find(e=>e.attribute===attribute);
  if(!element || element.format!==2)throw Error("Expected native XYZ mesh attribute: "+attribute);
  const binding=data.vertexBuffers[element.bindingIndex],bytes=vertices[element.bindingIndex];
  const floats=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let start=element.offset;start+12<=bytes.byteLength;start+=binding.stride)for(let axis=0;axis<3;axis++){
    const value=Math.fround(mutate(floats.getFloat32(start+axis*4,true),axis));
    floats.setFloat32(start+axis*4,value,true);min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
  }
  data.bounds={min:{x:min[0],y:min[1],z:min[2]},max:{x:max[0],y:max[1],z:max[2]}};
  const start=Math.ceil((header.headerLength+2+view.getUint16(header.headerLength,true))/4)*4;
  const payload=new Uint8Array(buffer,start);
  const metadata=new TextEncoder().encode(JSON.stringify(data)),offset=Math.ceil((header.headerLength+2+metadata.length)/4)*4;
  const output=new Uint8Array(offset+payload.length),out=new DataView(output.buffer);
  output.set(new Uint8Array(buffer,0,header.headerLength));out.setUint32(4,output.length,true);
  out.setUint16(header.headerLength,metadata.length,true);output.set(metadata,header.headerLength+2);output.set(payload,offset);
  parseBufferMeshData(output.buffer);return output;
}
