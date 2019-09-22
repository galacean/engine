import * as r3 from "../../enhanced";
import {getResource} from "./assets";
import {Camera} from "../../camera/Camera";

const nodeCache: { [id: string]: r3.Node } = {};

export function parserSceneGraph(engine: r3.Engine, {nodes = {}, abilities = {}}: { nodes: { [id: string]: NodeConfig }, abilities: { [id: string]: AbilityConfig } }) {
  const root = engine.currentScene.root;
  (window as any).root = root;
  // 创建 node
  Object.keys(nodes)
    .map(key => nodes[key])
    .map(value => createNode(engine, value))
    .forEach(value => addToStage(value, root));
  // 创建 ability
  Object.keys(abilities)
    .map(key => abilities[key])
    .forEach(value => createAbility(value, (engine as any).canvas));

}

export function createNode(engine: r3.Engine, config: NodeConfig) {
  const node = new r3.Node(null, null, config.name);
  node.position = config.position || [0, 0, 0];
  config.rotation = config.rotation || [0, 0, 0];
  node.setRotationAngles(config.rotation[0], config.rotation[1], config.rotation[2]);
  node.isActive = config.isActive || true;
  node.scale = config.scale || [1, 1, 1];
  nodeCache[config.id] = node;
  return config;
}

export function addToStage(value: NodeConfig, root: r3.Node) {
  const node = nodeCache[value.id];
  const parent = value.parent >= 0 ? nodeCache[value.parent] : root;
  parent.addChild.call(parent, node);
}

export function getNodeById(id: string) {
  return nodeCache[id];
}

function createAbility(abilityConfig: AbilityConfig, canvas) {
  const node = nodeCache[abilityConfig.node];
  const Constructor = getConstructor(abilityConfig.type);
  const props = mixPropsToExplicitProps(abilityConfig.props);
  const ability = node.createAbility(Constructor, props);
  if (ability instanceof Camera && canvas) {
    ability.attachToScene(canvas);
  }
}

function getConstructor(type: string) {
  const splits = type.split(".");
  let Constructor = null;
  if (splits.length === 1) {
    Constructor = r3[type];
  } else {
    Constructor = getResource(splits[1]);
  }
  if (Constructor) {
    return Constructor;
  } else {
    throw new Error(`${type} is not defined`);
  }
}

/**
 * 把配置文件里的描述部分实例化
 * @param props
 */
function mixPropsToExplicitProps(props): any {
  const explicitProps = {};
  Object.keys(props).forEach(k => {
    const prop = props[k];
    // 新对象
    if (prop && prop.type === "asset") {
      explicitProps[k] = getResource(prop.id);
    } else {
      explicitProps[k] = prop;
    }
  });

  return explicitProps;
}

interface NodeConfig {
  parent: number;
  id: string;
  name: string;
  isActive: boolean;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  children: any;
}

interface AbilityConfig {
  type: string;
  props: Object;
  node: string;
}
