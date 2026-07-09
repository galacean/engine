/**
 * Global X/Y/Z axis overlay for the water PCG demo.
 *
 * It follows the river debug renderer's ModelMesh line topology so the coordinate
 * guide stays lightweight and independent from the generated water meshes.
 */
import { Color, Engine, Entity, Material, MeshRenderer, Shader, Vector3 } from "@galacean/engine";
import { buildLineSegmentsMesh } from "../river/RiverMeshBuilder";
import {
  WORLD_AXIS_HALF_LENGTH,
  WORLD_AXIS_ORIGIN,
  WORLD_AXIS_RENDER_PRIORITY,
  WORLD_AXIS_SHADER_NAME,
  WORLD_AXIS_SHADER_PROPERTY,
  WORLD_AXIS_SPECS
} from "./constants";
import type { WorldAxisColorTuple, WorldAxisSpec } from "./types";

const axisLineShaderSource = `
Shader "${WORLD_AXIS_SHADER_NAME}" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }

      DepthState customDepthState {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.Always;
      }

      RasterState customRasterState {
        CullMode = CullMode.Off;
      }

      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      vec4 material_BaseColor;

      struct Attributes {
        vec4 POSITION;
      };

      VertexShader = vert;
      FragmentShader = frag;

      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * attr.POSITION;
      }

      void frag() {
        gl_FragColor = material_BaseColor;
      }
    }
  }
}`;

function createAxisMaterial(engine: Engine, color: WorldAxisColorTuple): Material {
  const shader = Shader.find(WORLD_AXIS_SHADER_NAME) ?? Shader.create(axisLineShaderSource);
  const material = new Material(engine, shader);
  material.shaderData.setColor(WORLD_AXIS_SHADER_PROPERTY.baseColor, new Color(color[0], color[1], color[2], color[3]));
  return material;
}

function createAxisPoint(axis: WorldAxisSpec, distance: number): Vector3 {
  return new Vector3(
    WORLD_AXIS_ORIGIN[0] + axis.direction[0] * distance,
    WORLD_AXIS_ORIGIN[1] + axis.direction[1] * distance,
    WORLD_AXIS_ORIGIN[2] + axis.direction[2] * distance
  );
}

function createAxisSegment(axis: WorldAxisSpec): Vector3[] {
  return [createAxisPoint(axis, -WORLD_AXIS_HALF_LENGTH), createAxisPoint(axis, WORLD_AXIS_HALF_LENGTH)];
}

function createAxisRenderer(engine: Engine, root: Entity, axis: WorldAxisSpec): MeshRenderer {
  const color = new Color(axis.color[0], axis.color[1], axis.color[2], axis.color[3]);
  const renderer = root.createChild(`${axis.name}-axis`).addComponent(MeshRenderer);

  renderer.mesh = buildLineSegmentsMesh(engine, createAxisSegment(axis), color);
  renderer.priority = WORLD_AXIS_RENDER_PRIORITY;
  renderer.setMaterial(createAxisMaterial(engine, axis.color));
  return renderer;
}

export class WorldAxesView {
  private readonly _root: Entity;
  private readonly _renderers: readonly MeshRenderer[];

  constructor(engine: Engine, parent: Entity) {
    this._root = parent.createChild("global-xyz-axes");
    this._renderers = WORLD_AXIS_SPECS.map((axis) => createAxisRenderer(engine, this._root, axis));
  }
}
