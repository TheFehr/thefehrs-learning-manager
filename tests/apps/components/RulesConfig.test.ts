import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import RulesConfig from "@/apps/components/RulesConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("RulesConfig.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockRules = {
    nonBulkMethod: "roll",
    bulkMethod: "direct",
    rollMode: "gmroll",
    checkDC: 10,
    checkFormula: "1d20 + @mod",
    critDoubleStrategy: "never",
    critThreshold: 20,
    bulkExpectedFormula: "@hours * 1",
    notificationLevel: "info",
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
  });

  it("should mount and show basic settings", async () => {
    instance = mount(RulesConfig, {
      target,
      props: { rules: { ...mockRules } },
    });
    await tick();

    expect(target.querySelector("select#rule-non-bulk-method")).not.toBeNull();
    expect(target.querySelector("input#rule-dc")).not.toBeNull();
  });

  it("should show roll settings when method is roll", async () => {
    instance = mount(RulesConfig, {
      target,
      props: { rules: { ...mockRules, nonBulkMethod: "roll" } },
    });
    await tick();

    expect(target.querySelector("input#rule-formula")).not.toBeNull();
    expect(target.querySelector("select#rule-crit")).not.toBeNull();
  });

  it("should show bulk expected formula when bulk method is mathematical", async () => {
    instance = mount(RulesConfig, {
      target,
      props: { rules: { ...mockRules, bulkMethod: "mathematical" } },
    });
    await tick();

    expect(target.querySelector("input#rule-bulk-formula")).not.toBeNull();
  });
});
