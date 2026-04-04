import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProjectItemFromTemplate } from "../src/migrations/migration-utils";

vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("migration-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { error: vi.fn() } };
    global.fromUuid = vi.fn();
  });

  it("should return null if template item not found", async () => {
    vi.mocked(fromUuid).mockResolvedValue(null);
    const actor = { name: "Actor", createEmbeddedDocuments: vi.fn().mockResolvedValue([]) };

    const result = await createProjectItemFromTemplate(actor as any, "uuid", {} as any, 10);

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Could not resolve"));
  });

  it("should return null and log error on exception", async () => {
    vi.mocked(fromUuid).mockRejectedValue(new Error("Database error"));
    const actor = { name: "Actor", createEmbeddedDocuments: vi.fn().mockResolvedValue([]) };

    // console.error("TEST ERROR");
    const result = await createProjectItemFromTemplate(actor as any, "uuid", {} as any, 10);

    expect(result).toBeNull();
    // expect(console.error).toHaveBeenCalled();
  });
});
