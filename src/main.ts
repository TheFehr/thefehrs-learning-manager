import { LearningManager } from "./LearningManager.js";
import { migrateData } from "./migrations/migration.js";

Hooks.once("init", () => LearningManager.init());
Hooks.once("ready", async () => {
  console.debug("Downtime Engine | Initialized");
  await migrateData();
});
