import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WorldSettingsConfig from "@/apps/components/WorldSettingsConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { TutelageResolverService } from "@/logic/tutelage-resolver";

vi.unmock("svelte");

vi.mock("@/logic/tutelage-resolver", () => ({
  TutelageResolverService: {
    clearCache: vi.fn(),
  },
}));

describe("WorldSettingsConfig.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockProps = {
    rules: {
      nonBulkMethod: "direct",
      bulkMethod: "direct",
      rollMode: "gmroll",
      checkDC: 10,
      checkFormula: "",
      critDoubleStrategy: "never",
      critThreshold: 20,
      notificationLevel: "info",
      bulkExpectedFormula: "round(@hours * (22 - max(1, @dc - (@mod))) / 20)",
    },
    timeUnits: [{ id: "h", name: "Hour", short: "h", isBulk: false, ratio: 1 }],
    teacherCompendiums: [],
    bookCompendiums: [],
    allowedCompendiums: [],
    availableItemPacks: [],
    instructorPacks: [],
    bookPacks: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
    vi.restoreAllMocks();
  });

  it("should mount and show header actions", async () => {
    instance = mount(WorldSettingsConfig, {
      target,
      props: { ...mockProps },
    });
    await tick();

    expect(target.querySelector("button[title='Export Settings']")).not.toBeNull();
    expect(target.querySelector("button[title='Import Settings']")).not.toBeNull();
    expect(target.querySelector("button[title='Clear Tutelage Cache']")).not.toBeNull();

    // Check child components presence via their headings or unique structures
    const headers = Array.from(target.querySelectorAll("h3")).map((h) => h.textContent);
    expect(headers).toContain("Global Rules");
    expect(headers).toContain("Template Compendiums (Items)");
    expect(headers).toContain("Instructor Compendiums (Actors)");
    expect(headers).toContain("Book Compendiums (Items)");
    expect(headers).toContain("Time Units");

    expect(target.querySelectorAll(".compendium-list")).toHaveLength(3);
    expect(target.querySelector(".tidy-table")).not.toBeNull(); // From TimeUnitsConfig
  });

  it("should call exportSettings on click", async () => {
    instance = mount(WorldSettingsConfig, {
      target,
      props: { ...mockProps },
    });
    await tick();

    const exportBtn = target.querySelector("button[title='Export Settings']") as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();
    exportBtn.click();

    expect(foundry.utils.saveDataToFile).toHaveBeenCalled();
    const callArgs = (foundry.utils.saveDataToFile as any).mock.calls[0];
    const exportedData = JSON.parse(callArgs[0]);
    expect(exportedData.rules.checkDC).toBe(10);
    expect(callArgs[1]).toBe("application/json");
    expect(callArgs[2]).toBe("downtime-engine-settings.json");
  });

  it("should call clearCache on click", async () => {
    instance = mount(WorldSettingsConfig, {
      target,
      props: { ...mockProps },
    });
    await tick();

    const clearBtn = target.querySelector(
      "button[title='Clear Tutelage Cache']",
    ) as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();
    clearBtn.click();

    expect(TutelageResolverService.clearCache).toHaveBeenCalled();
    expect(ui.notifications?.info).toHaveBeenCalledWith(expect.stringContaining("cache cleared"));
  });

  describe("importSettings", () => {
    let mockInput: HTMLInputElement;
    let mockReader: any;
    let createElementSpy: any;
    const originalFileReader = (globalThis as any).FileReader;

    beforeEach(() => {
      mockReader = {
        readAsText: vi.fn(),
        onload: null as any,
        onerror: null as any,
        onabort: null as any,
        error: new Error("File error"),
        result: "",
      };

      const originalCreateElement = document.createElement.bind(document);
      createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag) => {
        if (tag === "input") {
          mockInput = originalCreateElement("input") as HTMLInputElement;
          vi.spyOn(mockInput, "click").mockImplementation(() => {});
          return mockInput;
        }
        return originalCreateElement(tag);
      });

      (globalThis as any).FileReader = vi.fn().mockImplementation(function (this: any) {
        return mockReader;
      });
    });

    afterEach(() => {
      (globalThis as any).FileReader = originalFileReader;
      createElementSpy?.mockRestore();
    });

    it("should trigger file input on import click", async () => {
      instance = mount(WorldSettingsConfig, {
        target,
        props: { ...mockProps },
      });
      await tick();

      const importBtn = target.querySelector(
        "button[title='Import Settings']",
      ) as HTMLButtonElement;
      expect(importBtn).not.toBeNull();
      importBtn.click();

      expect(createElementSpy).toHaveBeenCalledWith("input");
      expect(mockInput.type).toBe("file");
      expect(mockInput.accept).toBe(".json");
      expect(mockInput.click).toHaveBeenCalled();
    });

    it("should successfully import all setting types", async () => {
      let rulesValue = mockProps.rules;
      let timeUnitsValue = mockProps.timeUnits;
      let teacherValue = mockProps.teacherCompendiums;
      let bookValue = mockProps.bookCompendiums;
      let allowedValue = mockProps.allowedCompendiums;

      instance = mount(WorldSettingsConfig, {
        target,
        props: {
          ...mockProps,
          get rules() {
            return rulesValue;
          },
          set rules(v) {
            rulesValue = v;
          },
          get timeUnits() {
            return timeUnitsValue;
          },
          set timeUnits(v) {
            timeUnitsValue = v;
          },
          get teacherCompendiums() {
            return teacherValue;
          },
          set teacherCompendiums(v) {
            teacherValue = v;
          },
          get bookCompendiums() {
            return bookValue;
          },
          set bookCompendiums(v) {
            bookValue = v;
          },
          get allowedCompendiums() {
            return allowedValue;
          },
          set allowedCompendiums(v) {
            allowedValue = v;
          },
        },
      });
      await tick();

      const importBtn = target.querySelector(
        "button[title='Import Settings']",
      ) as HTMLButtonElement;
      expect(importBtn).not.toBeNull();
      importBtn.click();

      // Simulate file selection
      const importedData = {
        rules: { ...mockProps.rules, checkDC: 30 },
        timeUnits: [{ id: "d", name: "Day", short: "d", isBulk: false, ratio: 8 }],
        teacherCompendiums: ["compendium.actors"],
        bookCompendiums: ["compendium.items"],
        allowedCompendiums: ["compendium.projects"],
      };

      const mockFile = new File([JSON.stringify(importedData)], "settings.json", {
        type: "application/json",
      });

      // Mock files property on the real input
      Object.defineProperty(mockInput, "files", {
        value: [mockFile],
        configurable: true,
      });

      // Trigger the event
      if (mockInput.onchange) {
        (mockInput as any).onchange({ target: mockInput });
      }

      expect(mockReader.readAsText).toHaveBeenCalledWith(mockFile);

      // Simulate load
      mockReader.result = JSON.stringify(importedData);
      await mockReader.onload({ target: mockReader });

      expect(rulesValue.checkDC).toBe(30);
      expect(timeUnitsValue[0].id).toBe("d");
      expect(teacherValue).toContain("compendium.actors");
      expect(bookValue).toContain("compendium.items");
      expect(allowedValue).toContain("compendium.projects");
      expect(ui.notifications?.info).toHaveBeenCalledWith(
        expect.stringContaining("Settings imported"),
      );
    });

    it("should handle invalid JSON error during import", async () => {
      instance = mount(WorldSettingsConfig, {
        target,
        props: { ...mockProps },
      });
      await tick();

      const importBtn = target.querySelector(
        "button[title='Import Settings']",
      ) as HTMLButtonElement;
      expect(importBtn).not.toBeNull();
      importBtn.click();

      if (mockInput.onchange) {
        (mockInput as any).onchange({ target: { files: [new File(["invalid"], "test.json")] } });
      }

      mockReader.result = "invalid-json";
      await mockReader.onload({ target: mockReader });

      expect(ui.notifications?.error).toHaveBeenCalledWith(
        expect.stringContaining("Invalid JSON format"),
      );
    });

    it("should handle FileReader error", async () => {
      instance = mount(WorldSettingsConfig, {
        target,
        props: { ...mockProps },
      });
      await tick();

      const importBtn = target.querySelector(
        "button[title='Import Settings']",
      ) as HTMLButtonElement;
      expect(importBtn).not.toBeNull();
      importBtn.click();

      if (mockInput.onchange) {
        (mockInput as any).onchange({ target: { files: [new File([""], "test.json")] } });
      }

      mockReader.onerror();

      expect(ui.notifications?.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read settings file"),
      );
    });

    it("should handle FileReader abort", async () => {
      instance = mount(WorldSettingsConfig, {
        target,
        props: { ...mockProps },
      });
      await tick();

      const importBtn = target.querySelector(
        "button[title='Import Settings']",
      ) as HTMLButtonElement;
      expect(importBtn).not.toBeNull();
      importBtn.click();

      if (mockInput.onchange) {
        (mockInput as any).onchange({ target: { files: [new File([""], "test.json")] } });
      }

      mockReader.onabort();

      expect(ui.notifications?.warn).toHaveBeenCalledWith(
        expect.stringContaining("Settings import aborted"),
      );
    });

    it("should cleanup if visibility changes", async () => {
      vi.useFakeTimers();
      try {
        instance = mount(WorldSettingsConfig, {
          target,
          props: { ...mockProps },
        });
        await tick();

        const importBtn = target.querySelector(
          "button[title='Import Settings']",
        ) as HTMLButtonElement;
        expect(importBtn).not.toBeNull();
        importBtn.click();

        document.dispatchEvent(new Event("visibilitychange"));

        vi.advanceTimersByTime(600);

        expect(mockInput.parentNode).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("should cleanup if no file is selected", async () => {
      vi.useFakeTimers();
      try {
        instance = mount(WorldSettingsConfig, {
          target,
          props: { ...mockProps },
        });
        await tick();

        const importBtn = target.querySelector(
          "button[title='Import Settings']",
        ) as HTMLButtonElement;
        expect(importBtn).not.toBeNull();
        importBtn.click();

        // mockInput is already "in the body" via our mock logic
        expect(mockInput.parentNode).toBe(document.body);

        // We need to trigger handleCancel which is bound to window focus
        window.dispatchEvent(new Event("focus"));

        vi.advanceTimersByTime(600);

        expect(mockInput.parentNode).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
