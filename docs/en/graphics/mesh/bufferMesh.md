---
order: 2
title: Buffer Mesh
type: Graphics
group: Mesh
label: Graphics/Mesh
---

[BufferMesh](/apis/core/#BufferMesh}) allows free manipulation of vertex buffer and index buffer data, as well as some instructions related to geometry drawing. It is efficient, flexible, and concise. Developers can use this class to efficiently and flexibly implement custom geometries.

## Schematic Diagram

Let's take a look at the schematic diagram of `BufferMesh`

![image.png](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*piB3Q4501loAAAAAAAAAAAAAARQnAQ)

`BufferMesh` has three core elements:

| Name                                                  | Description                                                             |
| :---------------------------------------------------- | :---------------------------------------------------------------------- |
| [VertexBufferBinding](/apis/core/#VertexBufferBinding) | Vertex buffer binding, used to pack vertex buffer and vertex stride (in bytes). |
| [VertexElement](/apis/core/#VertexElement)             | Vertex element, used to describe vertex semantics, vertex offset, vertex format, and vertex buffer binding index information. |
| [IndexBufferBinding](/apis/core/#IndexBufferBinding)   | Index buffer binding (optional), used to pack index buffer and index format. |

Among them, [IndexBufferBinding](/apis/core/#IndexBufferBinding}) is optional, which means there are only two necessary core elements. They are set through the [setVertexBufferBindings()](/apis/core/#BufferMesh-setVertexBufferBindings) interface and the [setVertexElements()](/apis/core/#BufferMesh-setVertexElements) interface. The last step is to add a submesh through [addSubMesh](/apis/core/#BufferMesh-addSubMesh) and set the vertex or index drawing count. [SubMesh](/apis/core/#SubMesh) contains three attributes: starting drawing offset, drawing count, primitive topology. Developers can add multiple [SubMesh](/apis/core/#SubMesh) independently, and each sub-geometry can correspond to a unique material.

## Common Use Cases

Here are a few common use cases of [MeshRenderer](/apis/core/#MeshRenderer) and [BufferMesh](/apis/core/#BufferMesh) because this class is more low-level and flexible, detailed code examples are provided.

### Interleaved Vertex Buffer

<playground src="buffer-mesh-interleaved.ts"></playground>

This is a common way to implement custom Mesh, Particle, etc., with advantages such as compact memory usage and fewer CPU data uploads to the GPU per frame. The main feature of this case is that multiple [VertexElement](/apis/core/#VertexElement) correspond to one *VertexBuffer* ([Buffer](/apis/core/#Buffer)), and only one *VertexBuffer* is used to associate different vertex elements with the Shader.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const vertices = new ArrayBuffer(vertexByteCount);

// create vertexBuffer and upload vertices.
const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices);

// bind vertexBuffer with stride, stride is every vertex byte length,so the value is 16.
mesh.setVertexBufferBinding(vertexBuffer, 16);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("COLOR", 12, VertexElementFormat.NormalizedUByte4, 0),
]);

// add one subMesh and set how many vertex you want to render.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```

### Independent Vertex Buffer

<playground src="buffer-mesh-independent.ts"></playground>

It has advantages when mixing dynamic and static vertex buffers, such as _position_ being static, but _color_ being dynamic. Independent vertex buffer can update only color data to the GPU. The main feature of this case is that one [VertexElement](/apis/core/#VertexElement) corresponds to one _VertexBuffer_, and you can independently update data by calling the [setData](/apis/core/#Buffer-setData) method of the [Buffer](/apis/core/#Buffer) object.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const positions = new Float32Array(vertexCount);
const colors = new Uint8Array(vertexCount);

// create vertexBuffer and upload vertices.
const positionBuffer = new Buffer(
  engine,
  BufferBindFlag.VertexBuffer,
  positions
);
const colorBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, colors);

// bind vertexBuffer with stride,stride is every vertex byte length,so the value is 12.
mesh.setVertexBufferBindings([
  new VertexBufferBinding(positionBuffer, 12),
  new VertexBufferBinding(colorBuffer, 4),
]);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("COLOR", 0, VertexElementFormat.NormalizedUByte4, 1),
]);

// add one subMesh and set how many vertex you want to render.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```

### Instance Rendering

<playground src="buffer-mesh-instance.ts"></playground>

GPU instance rendering is a common technique in 3D engines, where objects with the same geometry shape can be rendered at different positions simultaneously, significantly improving rendering performance. The main feature of this example is the use of the [VertexElement](/apis/core/#VertexElement) instance functionality. The last parameter of its constructor represents the instance step rate (the number of instances to draw for each vertex advancement in the buffer, non-instance elements must be 0), while [BufferMesh](/apis/core/#BufferMesh)'s [instanceCount](/apis/core/#BufferMesh-instanceCount) indicates the number of instances.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const vertices = new ArrayBuffer( vertexByteLength );

// create instance data.
const instances = new Float32Array( instanceDataLength );

// create vertexBuffer and upload vertex data.
const vertexBuffer = new Buffer( engine, BufferBindFlag.VertexBuffer, vertices );

// create instance buffer and upload instance data.
const instanceBuffer = new Buffer( engine, BufferBindFlag.VertexBuffer, instances );

// bind vertexBuffer with stride, stride is every vertex byte length,so the value is 16.
mesh.setVertexBufferBindings([new VertexBufferBinding( vertexBuffer, 16 ),
                                  new VertexBufferBinding( instanceBuffer, 12 )]);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([new VertexElement( "POSITION", 0, VertexElementFormat.Vector3, 0 ),
                            new VertexElement( "COLOR", 12, VertexElementFormat.NormalizedUByte4, 0 ),
                            new VertexElement( "INSTANCE_OFFSET", 0, VertexElementFormat.Vector3, 1 , 1 ),
                            new VertexElement( "INSTANCE_ROTATION", 12, VertexElementFormat.Vector3, 1 , 1 )]]);

// add one sub mesh and set how many vertex you want to render, here is full vertexCount.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```

## Index Buffer

Using an index buffer allows reusing vertices within a vertex buffer, thus saving memory. The usage is simple, by adding an index buffer object on top of the original base. The following code is modified from the first **interleaved vertex buffer** example.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const vertices = new ArrayBuffer(vertexByteCount);

// create indices.
const indices = new Uint16Array(indexCount);

// create vertexBuffer and upload vertices.
const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices);

// create indexBuffer and upload indices.
const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices);

// bind vertexBuffer with stride, stride is every vertex byte length,so the value is 16.
mesh.setVertexBufferBinding(vertexBuffer, 16);

// bind vertexBuffer with format.
mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("COLOR", 12, VertexElementFormat.NormalizedUByte4, 0),
]);

// add one subMesh and set how many vertex you want to render.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```
