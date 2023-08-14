import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Shader, ShaderProperty } from "../shader";
import { ParticleBillboardVertexAttribute } from "./enums/attributes/BillboardParticleVertexAttribute";
import { ParticleInstanceVertexAttribute } from "./enums/attributes/ParticleInstanceVertexAttribute";

/**
 * @internal
 */
export class ParticleBufferDefinition {
  readonly billboardVertexElement = new VertexElement(
    ParticleBillboardVertexAttribute.cornerTextureCoordinate,
    0,
    VertexElementFormat.Vector4,
    0
  );

  readonly instanceVertexElements = [
    new VertexElement(ParticleInstanceVertexAttribute.ShapePositionStartLifeTime, 0, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.DirectionTime, 16, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartColor, 32, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartSize, 48, VertexElementFormat.Vector3, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartRotation0, 60, VertexElementFormat.Vector3, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartSpeed, 72, VertexElementFormat.Float, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.Random0, 76, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.Random1, 92, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldPosition, 108, VertexElementFormat.Vector3, 1, 1), //TODO:local模式下可省去内存
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldRotation, 120, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationUV, 136, VertexElementFormat.Vector4, 1, 1)
  ];

  readonly instanceVertexStride = 152;
  readonly instanceVertexFloatStride = this.instanceVertexStride / 4;

  readonly startLifeTimeOffset = 3;
  readonly timeOffset = 7;
  readonly simulationOffset = 34;

  readonly billboardIndexCount = 6;

  billboardVertexBufferBinding: VertexBufferBinding;
  billboardIndexBufferBinding: IndexBufferBinding;

  //Base
  _worldPositionProperty: ShaderProperty = ShaderProperty.getByName("u_WorldPosition");
  _worldRotationProperty: ShaderProperty = ShaderProperty.getByName("u_WorldRotation");
  _positionScaleProperty: ShaderProperty = ShaderProperty.getByName("u_PositionScale");
  _sizeScaleProperty: ShaderProperty = ShaderProperty.getByName("u_SizeScale");
  _scaleModeProperty: ShaderProperty = ShaderProperty.getByName("u_ScalingMode");
  _gravityProperty: ShaderProperty = ShaderProperty.getByName("u_Gravity");
  _startRotation3DProperty: ShaderProperty = ShaderProperty.getByName("u_ThreeDStartRotation");
  _lengthScaleProperty: ShaderProperty = ShaderProperty.getByName("u_StretchedBillboardLengthScale");
  _speedScaleProperty: ShaderProperty = ShaderProperty.getByName("u_StretchedBillboardSpeedScale");
  _simulationSpaceProperty: ShaderProperty = ShaderProperty.getByName("u_SimulationSpace");
  _currentTime: ShaderProperty = ShaderProperty.getByName("u_CurrentTime");

  //VelocityOverLifetime
  VOLVELOCITYCONST: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityConst");
  VOLVELOCITYGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientX");
  VOLVELOCITYGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientY");
  VOLVELOCITYGRADIENTZ: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientZ");
  VOLVELOCITYCONSTMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityConstMax");
  VOLVELOCITYGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxX");
  VOLVELOCITYGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxY");
  VOLVELOCITYGRADIENTZMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxZ");
  VOLSPACETYPE: ShaderProperty = ShaderProperty.getByName("u_VOLSpaceType");

  //ColorOverLifetime
  COLOROVERLIFEGRADIENTALPHAS: ShaderProperty = ShaderProperty.getByName("u_ColorOverLifeGradientAlphas");
  COLOROVERLIFEGRADIENTCOLORS: ShaderProperty = ShaderProperty.getByName("u_ColorOverLifeGradientColors");
  MAXCOLOROVERLIFEGRADIENTALPHAS: ShaderProperty = ShaderProperty.getByName("u_MaxColorOverLifeGradientAlphas");
  MAXCOLOROVERLIFEGRADIENTCOLORS: ShaderProperty = ShaderProperty.getByName("u_MaxColorOverLifeGradientColors");

  //SizeOverLifetime
  SOLSIZEGRADIENT: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradient");
  SOLSIZEGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientX");
  SOLSIZEGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientY");
  SOLSizeGradientZ: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientZ");
  SOLSizeGradientMax: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMax");
  SOLSIZEGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxX");
  SOLSIZEGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxY");
  SOLSizeGradientZMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxZ");

  //RotationOverLifetime
  ROLANGULARVELOCITYCONST: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityConst");
  ROLANGULARVELOCITYCONSTSEPRARATE: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityConstSeprarate");
  ROLANGULARVELOCITYGRADIENT: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradient");
  ROLANGULARVELOCITYGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientX");
  ROLANGULARVELOCITYGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientY");
  ROLANGULARVELOCITYGRADIENTZ: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientZ");
  ROLANGULARVELOCITYCONSTMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityConstMax");
  ROLANGULARVELOCITYCONSTMAXSEPRARATE: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityConstMaxSeprarate"
  );
  ROLANGULARVELOCITYGRADIENTMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMax");
  ROLANGULARVELOCITYGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxX");
  ROLANGULARVELOCITYGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxY");
  ROLANGULARVELOCITYGRADIENTZMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxZ");
  ROLANGULARVELOCITYGRADIENTWMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxW");

  //TextureSheetAnimation
  TEXTURESHEETANIMATIONCYCLES: ShaderProperty = ShaderProperty.getByName("u_TSACycles");
  TEXTURESHEETANIMATIONSUBUVLENGTH: ShaderProperty = ShaderProperty.getByName("u_TSASubUVLength");
  TEXTURESHEETANIMATIONGRADIENTUVS: ShaderProperty = ShaderProperty.getByName("u_TSAGradientUVs");
  TEXTURESHEETANIMATIONGRADIENTMAXUVS: ShaderProperty = ShaderProperty.getByName("u_TSAMaxGradientUVs");

  constructor(engine: Engine) {
    const stride = 16;
    const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, stride * 4, BufferUsage.Static, false);
    const billboardVertices = new Float32Array([-0.5, -0.5, 0, 1, 0.5, -0.5, 1, 1, 0.5, 0.5, 1, 0, -0.5, 0.5, 0, 0]);
    vertexBuffer.setData(billboardVertices);
    this.billboardVertexBufferBinding = new VertexBufferBinding(vertexBuffer, stride);

    const indexBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      this.billboardIndexCount,
      BufferUsage.Static,
      false
    );
    const billboardIndices = new Uint8Array([0, 2, 1, 0, 3, 2]);
    indexBuffer.setData(billboardIndices);
    this.billboardIndexBufferBinding = new IndexBufferBinding(indexBuffer, IndexFormat.UInt8);
  }
}
