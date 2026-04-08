import { LearningManager } from "./LearningManager.js";

Hooks.once("init", () => LearningManager.init());
Hooks.once("ready", async () => {
  await LearningManager.ready();
});
