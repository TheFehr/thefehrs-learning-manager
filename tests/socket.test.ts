import { describe, it, expect, vi, beforeEach } from "vitest";
import { Socket } from "../src/core/socket";
import { Settings } from "../src/core/settings";

describe("Socket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.game = {
      socket: {
        on: vi.fn(),
        emit: vi.fn(),
      },
    } as any;
    vi.spyOn(Settings, "ID", "get").mockReturnValue("test-module");
  });

  it("should have correct identifier", () => {
    expect(Socket.identifier).toBe("module.test-module");
  });

  it("should register a listener on game.socket", () => {
    const handler = vi.fn();
    Socket.listen(handler);

    expect(game.socket.on).toHaveBeenCalledWith("module.test-module", expect.any(Function));

    // Simulate receiving a message
    const registeredHandler = vi.mocked(game.socket.on).mock.calls[0][1];
    const testMessage = { type: "timeGrantedSignal", data: null };
    registeredHandler(testMessage);

    expect(handler).toHaveBeenCalledWith(testMessage);
  });

  it("should emit a signal through game.socket", () => {
    Socket.emitSignal("timeGrantedSignal");

    expect(game.socket.emit).toHaveBeenCalledWith("module.test-module", {
      type: "timeGrantedSignal",
      data: null,
    });
  });

  it("should do nothing if game.socket is not available", () => {
    delete (global as any).game.socket;

    // Should not throw
    expect(() => Socket.listen(vi.fn())).not.toThrow();
    expect(() => Socket.emitSignal("timeGrantedSignal")).not.toThrow();
  });
});
