---
order: 3
title: Script Editing
type: Script
label: Script
---

Galacean Editor provides a powerful code editor with features such as code autocompletion, third-party package integration, engine event debugging, script parameter debugging, real-time project preview, and more, to help you quickly edit and debug code.

![image-20240318173952160](https://gw.alipayobjects.com/zos/OasisHub/2707ed27-a85a-4915-9db0-1cbed9e5c3dc/image-20240318173952160.png)

| Number | Area           | Description                                                  |
| ------ | -------------- | ------------------------------------------------------------ |
| 1      | File List      | View all script files in the project                        |
| 2      | Code Editing   | Edit script files, supporting features like syntax highlighting, code autocompletion, code formatting, etc. |
| 3      | Preview Area   | Preview the running effect of the current script. This area will refresh in real-time after saving the code |
| 4      | Package Manager | Add required [NPM](https://www.npmjs.org/) third-party packages, such as [tween.js](https://www.npmjs.com/package/@tweenjs/tween.js) |
| 5      | Event Debugging Area | The code editor will automatically search for all events bound to the engine and display them here. You can trigger events here and configure event parameters |
| 5      | Console        | View log information during code execution                   |

For more information about the code editor, please refer to [Script Editing](/en/docs/script-edit).



## Code Editing

After creating a script asset in the scene editor, double-click on the script to open the code editor. Scripts in Galacean are written in [Typescript](https://www.typescriptlang.org/) language, and new scripts are created based on built-in templates by default. Additionally, Galacean's code editor is based on Monaco, with keyboard shortcuts similar to VSCode. After modifying the script, press `Ctrl/⌘ + S` to save, and the real-time preview area on the right will show the latest scene effects.

> Tip: Galacean's code editor currently supports editing `.ts`, `.gs`, and `.glsl` files

## File Preview

<img src="https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*o51FQa9Uh0MAAAAAAAAAAAAADqiTAQ/original" alt="Code Editor Snapshot" style="zoom:50%;" />

1. **File Search** Quickly search for files in the project
2. **Code Filter** Toggle whether the file tree only shows code files (`.ts`, `.gs`, `.glsl`)
3. **Built-in Files** Indicates which files are non-editable internal files
4. **Expand/Collapse** Toggle the expansion or collapse of folders
5. **Code Files** Editable code files will display corresponding file type thumbnail icons

## Importing Third-Party Packages

The code editor comes with an engine corresponding to the project, providing intelligent suggestions for engine APIs to help you quickly implement logic based on the engine. However, in most cases, you will need to import Galacean ecosystem packages or other third-party packages to enhance functionality.

<img src="https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*Nc2MQqOeWxgAAAAAAAAAAAAADqiTAQ/original" alt="Code Editor Snapshot" style="zoom:50%;" />

1. **Search Box** Enter the package name in the search box and press Enter to quickly fetch the version list of the package
2. **Version Selection** By default, use the `latest` version
3. **Import Button** After selecting the package name and version, click the import button to load the type information of the third-party package into the workspace
4. **Package List** This section lists all third-party packages that the current project depends on
5. **Version Switching** Here, you can switch the version of the imported package. After switching, the new type information will be loaded into the workspace

> Try it out: Enter `@galacean/engine-toolkit` in the search box, click the "Import" button, and then use `import { OrbitControl } from '@galacean/engine-toolkit` in your code to import the free camera component.

## Real-time Preview Area

Galacean's code editor provides real-time preview functionality. After saving the code, the preview area will automatically update, allowing you to quickly view the execution result of the code.

<img src="https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*dCHqRIMdHbkAAAAAAAAAAAAADqiTAQ/original" alt="Code Editor Snapshot" style="zoom:50%;" />

1. **Drag Button** Hold and drag the simulator. Drag the simulator to the right edge of the screen to fix it on the right panel.
2. **Toggle Statistics** Click to toggle the display status of scene statistics information.
3. **Open in New Window** Open the project preview page in a new window.
4. **Script Parameter Editing** If the script activated in the current scene has configurable parameters, you can open this panel to adjust the script parameters in real-time. For detailed information on script parameters, please refer to [Script Attributes](/en/docs/script-attributes).
5. **Close Button** Click to close the simulator. After closing, a display button will be provided at the top right of the screen. Click to reopen the simulator.

## Event Debugging

In the code editor, we provide an event debugging panel to help you quickly debug events in the scene.

<img src="https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*xtmMT676qvcAAAAAAAAAAAAADqiTAQ/original" alt="Code Editor Snapshot" style="zoom:50%;" />

1. **Event List** Galacean Editor will automatically collect all event names in the scene and display them here.
2. **Event Parameter Configuration** You can click this button to configure the parameters carried when triggering an event. The configuration of parameters is written in `JSON` format.
3. **Event Trigger Button** Click this button to trigger the corresponding event in the scene.

> Note that the script component must be bound to an entity to display the event list.
