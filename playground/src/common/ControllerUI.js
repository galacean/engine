import * as dat from 'dat.gui';

export function createControllerUI(folderName, params, target) {
  let gui = new dat.GUI();
  let folder = gui.addFolder(folderName);
  folder.add(target, 'enabled', target.enabled);

  for (let key in params) {
    let p = params[key];
    folder.add(target, key, p[0], p[1]);
  }

  folder.open();
  gui.open();
  gui.domElement.style = 'position:absolute;top:0px;left:50vw';
  return gui;
}
