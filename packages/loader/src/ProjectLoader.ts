import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Scene
} from "@galacean/engine-core";
import { IProject, IFile } from "./resource-deserialize";

@resourceLoader(AssetType.Project, ["proj"], false)
export class ProjectLoader extends Loader<void> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress, onTaskCancel) => {
      const progress = {
        taskDetail: {} as Record<string, { loaded: number; total: number }>,
        taskComplete: { loaded: 0, total: 0 }
      };

      const updateTaskCompleteProgress = () => {
        setTaskCompleteProgress(progress.taskComplete.loaded, progress.taskComplete.total);
      };

      const onTaskDetail = (url: string, loaded: number, total: number) => {
        const detail = (progress.taskDetail[url] ||= { loaded: 0, total: 0 });
        detail.loaded = loaded;
        detail.total = total;
        setTaskDetailProgress(url, loaded, total);
      };

      const addTaskCompletePromise = (taskPromise: AssetPromise<any>) => {
        taskPromise.then(
          () => {
            progress.taskComplete.loaded++;
            updateTaskCompleteProgress();
          },
          () => {
            progress.taskComplete.loaded++;
            updateTaskCompleteProgress();
          }
        );
      };

      progress.taskComplete.total = 1;
      updateTaskCompleteProgress();

      const projectPromise = resourceManager
        // @ts-ignore
        ._request<IProject>(item.url, { ...item, type: "json" })
        .onProgress(
          (loaded: number, total: number) => onTaskDetail(item.url, loaded, total),
          (url: string, loaded: number, total: number) => onTaskDetail(url, loaded, total)
        );

      addTaskCompletePromise(projectPromise);

      const allLoadingPromises: AssetPromise<any>[] = [projectPromise];

      projectPromise
        .then((data: IProject) => {
          // @ts-ignore
          engine.resourceManager.initVirtualResources(data.files);

          console.log("data.files.length", data.files.length);

          progress.taskComplete.total = 1 + data.files.length;
          updateTaskCompleteProgress();

          const fileLoadPromises: AssetPromise<any>[] = [];

          data.files
            .filter((file: IFile) => file.virtualPath !== data.scene)
            .forEach((file: IFile) => {
              const filePromise = resourceManager
                .load({
                  url: file.virtualPath,
                  type: file.type as any
                })
                .onProgress(
                  (loaded: number, total: number) => onTaskDetail(file.virtualPath, loaded, total),
                  (url: string, loaded: number, total: number) => onTaskDetail(url, loaded, total)
                );

              addTaskCompletePromise(filePromise);
              fileLoadPromises.push(filePromise);
              allLoadingPromises.push(filePromise);
            });

          const scenePromise = resourceManager.load<Scene>({ type: AssetType.Scene, url: data.scene }).onProgress(
            (loaded: number, total: number) => onTaskDetail(data.scene, loaded, total),
            (url: string, loaded: number, total: number) => onTaskDetail(url, loaded, total)
          );

          addTaskCompletePromise(scenePromise);
          allLoadingPromises.push(scenePromise);

          onTaskCancel(() => {
            allLoadingPromises.forEach((promise) => promise.cancel());
          });

          return AssetPromise.all([...fileLoadPromises, scenePromise]).then((results) => {
            const scene = results[results.length - 1] as Scene;
            engine.sceneManager.activeScene = scene;
            resolve();
          });
        })
        .catch(reject);
    });
  }
}
