import { PluginHook } from "./PluginManager";
import { Oasis } from "../Oasis";

export type Plugin = ((oasis: Oasis) => PluginHook) | PluginHook;
