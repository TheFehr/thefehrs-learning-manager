import { vi } from "vitest";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (base: any) => base,
    },
  },
  utils: {
    randomID: vi.fn().mockReturnValue("randomid"),
  },
} as any;

globalThis.game = {
  settings: {
    register: vi.fn(),
    registerMenu: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
  user: { isGM: false },
  actors: { get: vi.fn() },
} as any;

globalThis.Hooks = {
  on: vi.fn(),
  once: vi.fn(),
} as any;

globalThis.Handlebars = {
  registerHelper: vi.fn(),
} as any;

globalThis.ui = {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
} as any;

globalThis.renderTemplate = vi.fn();
globalThis.Dialog = class {
  render = vi.fn();
} as any;
globalThis.ChatMessage = {
  create: vi.fn(),
} as any;
globalThis.fromUuid = vi.fn();
