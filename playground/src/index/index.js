import './index.less';
// import {markdown} from 'markdown';

let iframe = document.getElementById('viewport');
let container = document.getElementById('itemList');
let searchBar = document.getElementById('searchBar');
let prefab = document.getElementById('itemPrefab').cloneNode(true);
prefab.classList.remove('hide');
let doms = [];

ITEMLIST.forEach(({img, name, readme}, index) => {
  let cloneNode = prefab.cloneNode(true);
  let titleNode = cloneNode.getElementsByClassName('title')[0];
  // let mdNode = cloneNode.getElementsByClassName('md')[0];
  // let content = markdown.toHTML(readme);
  // mdNode.innerHTML=content;
  cloneNode.onclick = function () {
    view(name);
  }
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
    )
  } else {
    cloneNode.classList.add('simple');
  }

  container.appendChild(cloneNode);

  doms.push({
    dom: cloneNode,
    name,
    // readme
  })

  // 自动打开第一个
  if (index === 0) {
    view(name);
  }
})

searchBar.oninput = (() => {
  updateFilter(searchBar.value);
})

function updateFilter(value) {
  let reg = new RegExp(value, 'i');
  doms.forEach(({dom, name, readme}) => {
    // if (reg.test(name) || reg.test(readme)) {
    if (reg.test(name)) {
      dom.classList.remove('hide');
    }
    else {
      dom.classList.add('hide');
    }
  })
}

function view(pageName) {
  iframe.setAttribute('src', pageName + '.html');
  doms.forEach(({dom, name}) => {
    if (name === pageName) {
      dom.classList.add('pick');
    } else {
      dom.classList.remove('pick');
    }
  });
}

