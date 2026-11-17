import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady, pinnedPackages, pinnedVersions } from "./utils";

// Runs first (the 00- prefix sorts it ahead of every other spec). The other specs
// drive Tidy5e's markup; if Tidy5e is missing, inactive, the wrong version, or its
// sheets are not registered, Foundry silently falls back to dnd5e's default sheets
// and they fail later with unrelated "element(s) not found" errors. Fail here
// instead, and say exactly what is wrong.

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  ...pinnedPackages,
  adminPassword: "admin",
  backupName: "fp-base-environment",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);
  },
});

test.describe("E2E environment", () => {
  test("Tidy5e is installed, active, pinned and has its sheets registered", async ({ page }) => {
    await waitForGameReady(page);

    const state = await page.evaluate(() => {
      const g = game as any;
      const sheetIds = (documentName: string, type: string): string[] =>
        Object.keys((CONFIG as any)[documentName]?.sheetClasses?.[type] ?? {});
      return {
        foundry: g.version,
        generation: g.release?.generation,
        system: { id: g.system?.id, version: g.system?.version },
        tidy5e: {
          installed: !!g.modules.get("tidy5e-sheet"),
          active: !!g.modules.get("tidy5e-sheet")?.active,
          version: g.modules.get("tidy5e-sheet")?.version ?? null,
        },
        learningManagerActive: !!g.modules.get("thefehrs-learning-manager")?.active,
        activeModules: [...g.modules.values()].filter((m: any) => m.active).map((m: any) => m.id),
        sheets: {
          character: sheetIds("Actor", "character"),
          group: sheetIds("Actor", "group"),
          item: sheetIds("Item", "loot"),
        },
      };
    });

    const quadrone = state.generation >= 14;
    const expected = {
      character: quadrone ? "dnd5e.Tidy5eCharacterSheetQuadrone" : "dnd5e.Tidy5eCharacterSheet",
      group: "dnd5e.Tidy5eGroupSheetQuadrone",
      item: "dnd5e.Tidy5eItemSheetQuadrone",
    } as const;

    const problems: string[] = [];
    if (!state.tidy5e.installed)
      problems.push("Tidy5e (tidy5e-sheet) is not installed in the world.");
    else if (!state.tidy5e.active) problems.push("Tidy5e is installed but not active.");
    if (state.generation >= 14) {
      if (state.tidy5e.version !== pinnedVersions?.tidy5e)
        problems.push(
          `Tidy5e version is ${state.tidy5e.version}, expected the pinned ${pinnedVersions?.tidy5e}.`,
        );
      if (state.system.version !== pinnedVersions?.dnd5e)
        problems.push(
          `dnd5e version is ${state.system.version}, expected the pinned ${pinnedVersions?.dnd5e}.`,
        );
    }
    if (!state.learningManagerActive)
      problems.push("The Downtime Engine module (thefehrs-learning-manager) is not active.");
    for (const kind of ["character", "group", "item"] as const) {
      if (!state.sheets[kind].includes(expected[kind]))
        problems.push(
          `Sheet ${expected[kind]} is not registered for ${kind}s (registered: ${state.sheets[kind].join(", ") || "none"}). Foundry would silently fall back to dnd5e's default sheet.`,
        );
    }

    expect(
      problems,
      [
        "The e2e environment is not what the other specs assume.",
        ...problems.map((p) => ` - ${p}`),
        "",
        "World state:",
        JSON.stringify(state, null, 2),
      ].join("\n"),
    ).toEqual([]);
  });
});
