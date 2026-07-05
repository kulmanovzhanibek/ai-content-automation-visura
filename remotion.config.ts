import { Config } from "@remotion/cli/config";
import { existsSync } from "node:fs";

Config.setEntryPoint("remotion/src/index.ts");
// Job assets (clips, voice) are served from jobs/ — props reference paths
// relative to it, e.g. staticFile("test-kling/clips/clip_1.mp4").
Config.setPublicDir("jobs");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// Sandboxed cloud environments block the headless-shell download; use the
// pre-installed Playwright headless shell when present (no effect locally).
// The full Chromium binary won't work: new Chrome removed old headless mode.
const preinstalledHeadlessShell =
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
if (existsSync(preinstalledHeadlessShell)) {
  Config.setBrowserExecutable(preinstalledHeadlessShell);
}
