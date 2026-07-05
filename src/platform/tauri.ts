import { getVersion } from "@tauri-apps/api/app";
import type { Platform } from "./index";

export const tauriPlatform: Platform = {
  appVersion: () => getVersion(),
};
