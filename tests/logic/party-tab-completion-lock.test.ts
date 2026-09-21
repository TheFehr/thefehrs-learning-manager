import { describe, it, expect, beforeEach } from "vitest";
import { PartyTabCompletionLock } from "../../src/logic/party-tab-completion-lock";

describe("PartyTabCompletionLock", () => {
  beforeEach(() => {
    PartyTabCompletionLock.clear();
  });

  it("acquires a lock that isn't held yet", () => {
    expect(PartyTabCompletionLock.tryAcquire("Actor.a", "item-a")).toBe(true);
  });

  it("refuses a second acquire for the same project while the lock is held", () => {
    expect(PartyTabCompletionLock.tryAcquire("Actor.a", "item-a")).toBe(true);
    expect(PartyTabCompletionLock.tryAcquire("Actor.a", "item-a")).toBe(false);
  });

  it("allows re-acquiring after release", () => {
    expect(PartyTabCompletionLock.tryAcquire("Actor.a", "item-a")).toBe(true);
    PartyTabCompletionLock.release("Actor.a", "item-a");
    expect(PartyTabCompletionLock.tryAcquire("Actor.a", "item-a")).toBe(true);
  });

  it("keys locks per actor+item, not just per item id", () => {
    expect(PartyTabCompletionLock.tryAcquire("Actor.a", "item-shared")).toBe(true);
    expect(PartyTabCompletionLock.tryAcquire("Actor.b", "item-shared")).toBe(true);
  });

  it("releasing a lock that isn't held is a no-op", () => {
    expect(() => PartyTabCompletionLock.release("Actor.none", "item-none")).not.toThrow();
  });
});
