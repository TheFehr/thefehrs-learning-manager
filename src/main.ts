import { LearningManager } from "./LearningManager.js";
import { ProjectEngine } from "./logic/project-engine.js";

Hooks.once("init", () => {
  LearningManager.init();

  // Expose API for E2E tests and other modules
  const module = game.modules.get(LearningManager.ID);
  if (module) {
    (module as any).api = {
      ProjectEngine,
    };
  }
});

Hooks.once("ready", async () => {
  await LearningManager.ready();
});
