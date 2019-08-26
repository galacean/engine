import inject from 'rollup-plugin-inject';
import modify from 'rollup-plugin-modify';

const module = '@alipay/o3-adapter-miniprogram';

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
  console.log(`------------adapter ${name} ------------`);
});

export default [
  inject(adapterVars),
  modify({
    find: /@alipay\/([\w-]*)/g,
    replace: (match, moduleName) => `@alipay/${moduleName}/dist/miniprogram`
  }),
];
