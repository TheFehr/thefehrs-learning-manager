import { describe, it, expect, vi, beforeEach } from "vitest";
import { PartyTabLogic } from "../src/apps/party-tab-logic";
import { Settings } from "../src/core/settings";
import { TabLogic } from "../src/tab-logic";
import { ActorProxy } from "../src/actor-proxy";
import { ProjectEngine } from "../src/project-engine";

vi.mock("../src/core/settings");
vi.mock("../src/tab-logic");
vi.mock("../src/actor-proxy");
vi.mock("../src/project-engine");

describe("PartyTabLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Settings.timeUnits
    vi.spyOn(Settings, "timeUnits", "get").mockReturnValue([]);

    // Mock ChatMessage.implementation
    (global as any).ChatMessage = {
      implementation: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
  });

  describe("processGrantTime", () => {
    it("should call signalTimeDistribution after granting time", async () => {
      const timeValues = { hour: 1 };
      const selectedIds = ["actor1"];

      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(1);
      vi.mocked(TabLogic.formatTimeBank).mockReturnValue("1h");

      const mockActor = { id: "actor1" };
      (game.actors as any).push(mockActor);

      const mockProxy = {
        bank: { total: 0 },
        setBank: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await PartyTabLogic.processGrantTime(timeValues, selectedIds);

      expect(ProjectEngine.signalTimeDistribution).toHaveBeenCalled();
    });

    it("should not call signalTimeDistribution if no time is entered", async () => {
      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(0);

      await PartyTabLogic.processGrantTime({}, ["actor1"]);

      expect(ProjectEngine.signalTimeDistribution).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith("No time entered.");
    });

    it("should not call signalTimeDistribution if no recipients selected", async () => {
      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(1);

      await PartyTabLogic.processGrantTime({ hour: 1 }, []);

      expect(ProjectEngine.signalTimeDistribution).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith("No recipients selected.");
    });
  });
});
