import inject from '@rollup/plugin-inject';
import modify from 'rollup-plugin-modify';

const module = '@ali/miniprogram-adapter';

function register(name) {
  return [module, name];
}

const adapterArray = [
  'window',
  'atob',
  'devicePixelRatio',
  'document',
  'Element',
  'Event',
  'EventTarget',
  'HTMLCanvasElement',
  'HTMLElement',
  'HTMLMediaElement',
  'HTMLVideoElement',
  'Image',
  'navigator',
  'Node',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'screen',
  'XMLHttpRequest',
  'performance',
];
const adapterVars = {};

adapterArray.forEach(name => {
  adapterVars[name] = register(name);
});

export default [
  inject(adapterVars),
  modify({
    find: /@alipay\/(o3[\w-]*)/g,
    replace: (match, moduleName) => `@alipay/${moduleName}/dist/miniprogram`
  }),
];
