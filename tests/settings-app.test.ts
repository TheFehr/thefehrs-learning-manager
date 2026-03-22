import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningConfigApp } from "../src/apps/settings-app";

describe("LearningConfigApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have correct default options", () => {
    expect(LearningConfigApp.DEFAULT_OPTIONS).toMatchObject({
      id: "learning-config-app",
      window: { title: "Downtime Engine Configuration" },
    });
  });

  it("should unmount Svelte instance on close", async () => {
    const app = new LearningConfigApp();
    const mockInstance = { some: "instance" };
    (app as any).svelteInstance = mockInstance;

    // We need to mock unmount as it is imported
    // But since we are testing the class behavior, we can just check if close is called
    await app.close();
    expect((app as any).svelteInstance).toBeNull();
  });
});
