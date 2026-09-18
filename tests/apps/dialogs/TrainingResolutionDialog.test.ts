import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TrainingResolutionDialog from "@/apps/dialogs/TrainingResolutionDialog.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("TrainingResolutionDialog.svelte", () => {
  let instance: ReturnType<typeof mount> | undefined;
  let target: HTMLDivElement | null;

  const baseProps = {
    tuName: "Hour",
    bulkValue: 3,
    chancePercent: 65,
    separateValue: 9,
    checkDC: 12,
    batchThreshold: 10,
    ratio: 3,
    currentProgress: 5,
    target: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) {
      unmount(instance);
    }
    instance = undefined;
    if (target) {
      target.remove();
      target = null;
    }
  });

  it("shows current progress against target", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: { ...baseProps, isBulkRoll: true, isSeparateRoll: true },
    });
    await tick();

    expect(target!.textContent).toContain("Current progress:");
    expect(target!.textContent).toContain("5 / 20");
  });

  it("shows an expected-value phrasing with a projected total for a roll-based bulk method", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: { ...baseProps, isBulkRoll: true, isSeparateRoll: false },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("Expected progress:");
    expect(text).toContain("3");
    expect(text).toContain("(one roll)");
    // currentProgress (5) + bulkValue (3) = 8
    expect(text).toContain("8 / 20");
  });

  it("shows a fixed-gain phrasing with a new total for a fixed bulk method", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: { ...baseProps, isBulkRoll: false, isSeparateRoll: false },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("Gaining");
    expect(text).toContain("progress fixed");
    expect(text).toContain("new total:");
    expect(text).toContain("8 / 20");
  });

  it("shows the separate method's projected total and per-hour chance", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: { ...baseProps, isBulkRoll: false, isSeparateRoll: true },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("across 3 rolls");
    // currentProgress (5) + separateValue (9) = 14
    expect(text).toContain("14 / 20");
    expect(text).toContain("65%");
    expect(text).toContain("DC 12");
  });

  it("shows a probability-unavailable note instead of a chance percentage", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: {
        ...baseProps,
        isBulkRoll: false,
        isSeparateRoll: true,
        chancePercent: "unavailable",
      },
    });
    await tick();

    expect(target!.textContent).toContain("Probability unavailable.");
  });

  it("caps the projected total at target instead of overshooting it", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: {
        ...baseProps,
        isBulkRoll: true,
        isSeparateRoll: false,
        currentProgress: 18,
        bulkValue: 5,
        target: 20,
      },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("20 / 20");
    expect(text).not.toContain("23 / 20");
  });

  it("shows the projected total as unavailable when currentProgress or target is non-finite", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: {
        ...baseProps,
        isBulkRoll: true,
        isSeparateRoll: false,
        currentProgress: NaN,
      },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("unavailable");
    expect(text).not.toContain("NaN");
  });

  it("shows the projected total as unavailable when target is Infinity or non-positive", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: {
        ...baseProps,
        isBulkRoll: true,
        isSeparateRoll: false,
        target: Infinity,
      },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("unavailable");
    expect(text).not.toContain("Infinity");
  });

  it("shows a warning when the separate method triggers many rolls", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: { ...baseProps, isBulkRoll: false, isSeparateRoll: true, ratio: 8 },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("This will trigger 8 separate");
    expect(text).toContain("roll messages");
  });

  it("summarizes rolls in one message once past the batch threshold", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: {
        ...baseProps,
        isBulkRoll: false,
        isSeparateRoll: true,
        ratio: 12,
        batchThreshold: 10,
      },
    });
    await tick();

    expect(target!.textContent).toContain("rolls (summarized in one message)");
  });

  it("does not show the many-rolls warning when ratio is low", async () => {
    instance = mount(TrainingResolutionDialog, {
      target: target!,
      props: { ...baseProps, isBulkRoll: false, isSeparateRoll: true, ratio: 2 },
    });
    await tick();

    expect(target!.textContent).not.toContain("This will trigger");
  });
});
