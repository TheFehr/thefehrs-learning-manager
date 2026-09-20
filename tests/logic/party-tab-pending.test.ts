import { describe, it, expect, beforeEach } from "vitest";
import { PartyTabPending, withProgressSuffix } from "../../src/logic/party-tab-pending";

describe("withProgressSuffix", () => {
  it("appends a progress suffix to a name with none yet", () => {
    expect(withProgressSuffix("Test Learning Feat", 5, 10)).toBe("Test Learning Feat (5/10)");
  });

  it("replaces an existing progress suffix rather than appending a second one", () => {
    expect(withProgressSuffix("Test Learning Feat (5/10)", 7, 10)).toBe(
      "Test Learning Feat (7/10)",
    );
  });
});

describe("PartyTabPending", () => {
  beforeEach(() => {
    PartyTabPending.clear();
  });

  it("passes through a fresh read unchanged when nothing is pending", () => {
    const resolved = PartyTabPending.resolve("Actor.none", "item-none", {
      progress: 3,
      target: 10,
      name: "Feat (3/10)",
    });
    expect(resolved).toEqual({ progress: 3, target: 10, name: "Feat (3/10)" });
  });

  it("overrides a fresh read with a pending progress edit until it's confirmed, updating the name suffix too", () => {
    PartyTabPending.setProgress("Actor.a", "item-a", 7);

    expect(
      PartyTabPending.resolve("Actor.a", "item-a", {
        progress: 3,
        target: 10,
        name: "Feat (3/10)",
      }),
    ).toEqual({ progress: 7, target: 10, name: "Feat (7/10)" });

    // Once a read confirms the pending value, it stops overriding.
    expect(
      PartyTabPending.resolve("Actor.a", "item-a", {
        progress: 7,
        target: 10,
        name: "Feat (7/10)",
      }),
    ).toEqual({ progress: 7, target: 10, name: "Feat (7/10)" });
    expect(
      PartyTabPending.resolve("Actor.a", "item-a", {
        progress: 0,
        target: 10,
        name: "Feat (0/10)",
      }),
    ).toEqual({ progress: 0, target: 10, name: "Feat (0/10)" });
  });

  it("overrides a fresh read with a pending target edit until it's confirmed, updating the name suffix too", () => {
    PartyTabPending.setTarget("Actor.b", "item-b", 20);

    expect(
      PartyTabPending.resolve("Actor.b", "item-b", {
        progress: 3,
        target: 10,
        name: "Feat (3/10)",
      }),
    ).toEqual({ progress: 3, target: 20, name: "Feat (3/20)" });

    expect(
      PartyTabPending.resolve("Actor.b", "item-b", {
        progress: 3,
        target: 20,
        name: "Feat (3/20)",
      }),
    ).toEqual({ progress: 3, target: 20, name: "Feat (3/20)" });
  });

  it("tracks progress and target edits on the same project independently", () => {
    PartyTabPending.setProgress("Actor.c", "item-c", 7);
    PartyTabPending.setTarget("Actor.c", "item-c", 20);

    // Only target confirmed so far - progress should still be overridden.
    expect(
      PartyTabPending.resolve("Actor.c", "item-c", {
        progress: 3,
        target: 20,
        name: "Feat (3/20)",
      }),
    ).toEqual({ progress: 7, target: 20, name: "Feat (7/20)" });

    // Now progress confirms too - both should pass through untouched.
    expect(
      PartyTabPending.resolve("Actor.c", "item-c", {
        progress: 7,
        target: 20,
        name: "Feat (7/20)",
      }),
    ).toEqual({ progress: 7, target: 20, name: "Feat (7/20)" });
    expect(
      PartyTabPending.resolve("Actor.c", "item-c", { progress: 1, target: 1, name: "Feat (1/1)" }),
    ).toEqual({ progress: 1, target: 1, name: "Feat (1/1)" });
  });

  it("keys pending edits per actor+item, not just per item id", () => {
    PartyTabPending.setProgress("Actor.d1", "item-shared", 9);

    expect(
      PartyTabPending.resolve("Actor.d2", "item-shared", {
        progress: 1,
        target: 10,
        name: "Feat (1/10)",
      }),
    ).toEqual({ progress: 1, target: 10, name: "Feat (1/10)" });
    expect(
      PartyTabPending.resolve("Actor.d1", "item-shared", {
        progress: 1,
        target: 10,
        name: "Feat (1/10)",
      }),
    ).toEqual({ progress: 9, target: 10, name: "Feat (9/10)" });
  });
});
