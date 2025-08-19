import demoList from "./dist/.demoList.json";
const itemListDOM = document.getElementById("itemList");
const searchBarDOM = document.getElementById("searchBar");
const fullScreenDOM = document.getElementById("fullScreen");
const iframe = document.getElementById("iframe");
const items = []; // itemDOM,label

Object.keys(demoList).forEach((group, groupIndex) => {
  const demos = demoList[group];
  const groupDOM = document.createElement("div");
  const titleDOM = document.createElement("div");
  const demosDOM = document.createElement("div");

  // Create modern category title
  titleDOM.innerHTML = `
    <div class="flex items-center space-x-2 mb-3">
      <div class="w-1 h-4 bg-gradient-to-b from-galacean-500 to-galacean-700 rounded-full"></div>
      <h3 class="category-title text-sm font-semibold uppercase tracking-wider">${group}</h3>
    </div>
  `;

  // Add spacing between groups
  if (groupIndex > 0) {
    groupDOM.classList.add("mt-6");
  }

  itemListDOM.appendChild(groupDOM);
  groupDOM.appendChild(titleDOM);
  groupDOM.appendChild(demosDOM);

  // Style the demos container
  demosDOM.classList.add("space-y-1", "mb-4");

  demos.forEach((item) => {
    const { label, src } = item;
    const itemDOM = document.createElement("a");

    itemDOM.innerHTML = `
      <div class="flex items-center space-x-3 p-3 rounded-lg demo-item group">
        <div class="w-2 h-2 rounded-full bg-slate-300 group-hover:bg-galacean-500 transition-colors duration-200"></div>
        <span class="text-sm font-medium text-slate-700 group-hover:text-slate-900">${label}</span>
      </div>
    `;

    itemDOM.title = `${src}`;
    itemDOM.classList.add(
      "block",
      "cursor-pointer",
      "transition-all",
      "duration-200",
      "overflow-hidden",
      "no-underline",
      "rounded-lg"
    );

    itemDOM.onclick = function () {
      clickItem(itemDOM);
    };
    demosDOM.appendChild(itemDOM);

    items.push({
      itemDOM,
      label,
      src
    });
  });
});

searchBarDOM.oninput = () => {
  updateFilter(searchBarDOM.value);
};

fullScreenDOM.onclick = () => {
  const itemName = location.hash.split("#dist/")[1];

  if (itemName) {
    location.href = location.origin + `/dist/${itemName}.html`;
  }
};

function updateFilter(value) {
  const reg = new RegExp(value, "i");

  items.forEach(({ itemDOM, label, src }) => {
    reg.lastIndex = 0;
    if (reg.test(label) || reg.test(src)) {
      itemDOM.classList.remove("hide");
    } else {
      itemDOM.classList.add("hide");
    }
  });
}

function clickItem(itemDOM) {
  window.location.hash = `#dist/${itemDOM.title}`;
}

function onHashChange() {
  const hashPath = window.location.hash.split("#")[1];
  if (!hashPath) {
    clickItem(items[0].itemDOM);
    return;
  }

  iframe.src = hashPath + ".html";

  items.forEach(({ itemDOM }) => {
    const itemPath = `dist/${itemDOM.title}`;
    if (itemPath === hashPath) {
      itemDOM.classList.add("active");
    } else {
      itemDOM.classList.remove("active");
    }
  });
}

window.onhashchange = onHashChange;

// init
onHashChange();
