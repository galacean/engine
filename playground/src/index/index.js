import './index.less';
// import {markdown} from 'markdown';

let iframe = document.getElementById('viewport');
let container = document.getElementById('itemList');
let searchBar = document.getElementById('searchBar');
let prefab = document.getElementById('itemPrefab').cloneNode(true);
prefab.classList.remove('hide');
let doms = [];

ITEMLIST.forEach(({ img, name, readme }, index) => {
  let cloneNode = prefab.cloneNode(true);
  let titleNode = cloneNode.getElementsByClassName('title')[0];
  // let mdNode = cloneNode.getElementsByClassName('md')[0];
  // let content = markdown.toHTML(readme);
  // mdNode.innerHTML=content;
  cloneNode.onclick = function() {
    clickItem(name);
  };
  titleNode.innerHTML = name;
  titleNode.setAttribute('title', name);
  if (img) {
    let avatarNode = clone.getElementsByClassName('avatar')[0];
    let imgUrl = null;
    if (img === 'jpg') {
      imgUrl = require(`../${name}/avatar.jpg`);
    } else if (img === 'png') {
      imgUrl = require(`../${name}/avatar.png`);
    }
    avatarNode.setAttribute('style',
      `background-image:url(${imgUrl})`
    );
  } else {
    cloneNode.classList.add('simple');
  }

  container.appendChild(cloneNode);

  doms.push({
    dom: cloneNode,
    name
    // readme
  });

  // 如果没有hash,自动打开第一个
  if (index === 0) {
    clickItem(getPageNameFromHash() || name);
  }
});

searchBar.oninput = (() => {
  updateFilter(searchBar.value);
});

function updateFilter(value) {
  let reg = new RegExp(value, 'i');
  doms.forEach(({ dom, name, readme }) => {
    // if (reg.test(name) || reg.test(readme)) {
    if (reg.test(name)) {
      dom.classList.remove('hide');
    }
    else {
      dom.classList.add('hide');
    }
  });
}

function clickItem(itemName) {
  let hashPageName = getPageNameFromHash();
  if (itemName === hashPageName) {
    onHashChange();
  } else {
    window.location.hash = `#${itemName}`;
  }
}

function getPageNameFromHash() {
  let pageName = '';
  let hash = window.location.hash;
  if (hash) {
    pageName = hash.split('#')[1];
  }
  return pageName;
}

function onHashChange() {
  let pageName = getPageNameFromHash();
  iframe.setAttribute('src', pageName + '.html');
  doms.forEach(({ dom, name }) => {
    if (name === pageName) {
      dom.classList.add('pick');
    } else {
      dom.classList.remove('pick');
    }
  });
}

window.onhashchange = onHashChange;
