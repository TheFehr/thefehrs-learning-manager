import { describe, it, expect, vi, beforeEach } from "vitest";
import { TheFehrsLearningManager } from "../src/main";

describe("Data Migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (game.actors as any[]) = [];
    game.user.isGM = true;
  });

  it("should migrate version 0 to 1 with existing projects", async () => {
    // Setup existing project templates
    const library = [
      {
        id: "tpl1",
        name: "Existing Project",
        target: 100,
        rewardUuid: "item1",
        rewardType: "item",
        requirements: [],
      },
    ];

    // Mock settings
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 0;
      if (key === "projectTemplates") return library;
      return null;
    });

    // Setup an actor with old-style project (no templateId)
    const actor = new Actor() as any;
    actor.name = "Test Actor";
    actor.flags = {
      [TheFehrsLearningManager.ID]: {
        projects: [
          {
            id: "p1",
            name: "Existing Project",
            progress: 50,
            maxProgress: 100,
            rewardUuid: "item1",
            rewardType: "item",
          },
        ],
      },
    };
    (game.actors as any[]).push(actor);

    await TheFehrsLearningManager.migrateData();

    // Check if actor flag was updated
    expect(actor.setFlag).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projects",
      expect.arrayContaining([
        expect.objectContaining({
          id: "p1",
          templateId: "tpl1",
          progress: 50,
        }),
      ]),
    );

    // Check if migration version was updated
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      1,
    );
  });

  it("should create a new template if matching one is not found in library", async () => {
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 0;
      if (key === "projectTemplates") return [];
      return null;
    });

    const actor = new Actor() as any;
    actor.flags = {
      [TheFehrsLearningManager.ID]: {
        projects: [{ id: "p1", name: "Brand New Project", progress: 10, maxProgress: 50 }],
      },
    };
    (game.actors as any[]).push(actor);

    await TheFehrsLearningManager.migrateData();

    // Check if a new template was added to library
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projectTemplates",
      expect.arrayContaining([
        expect.objectContaining({
          name: "Brand New Project",
          target: 50,
        }),
      ]),
    );

    // Check if actor project now points to the new template
    const setFlagCall = vi.mocked(actor.setFlag).mock.calls.find((call) => call[1] === "projects");
    expect(setFlagCall![2][0].templateId).toBe("randomid");
  });

  it("should skip migration if version is already 1 or higher", async () => {
    vi.mocked(game.settings.get).mockReturnValue(1);

    await TheFehrsLearningManager.migrateData();

    expect(ui.notifications.info).not.toHaveBeenCalled();
    expect(game.settings.set).not.toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      expect.anything(),
    );
  });

  it("should skip migration if user is not GM", async () => {
    vi.mocked(game.settings.get).mockReturnValue(0);
    game.user.isGM = false;

    await TheFehrsLearningManager.migrateData();

    expect(ui.notifications.info).not.toHaveBeenCalled();
  });
});
