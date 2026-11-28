# Project files

The virtual file view owns paths, directories, mounts, source metadata, lazy reads and listing. Providers retain ownership of their content; a namespace snapshot lasts for one operation.

- `virtual-project-files.ts`: provider contract, mount composition, namespace validation, `read`/`list`, cancellation and conflict details.
- `project-file-types.ts`: shared file-type inference for source catalogs and asset import.

Runtime Editor owns mutation, dependency maintenance, persistence and undo. Agent adapters expose this view through `read_tool` and `list_tool`. A source mounted under `remote/` is a read-only file catalog; its presence does not install or activate a system.

Runtime Editor's asset import and VFS tests cover this module. The file view has no dependency on the Editor, AI Chat or Seed World.
