import { vi } from "vitest";

globalThis.foundry = {
  appv1: {
    api: {
      Dialog: class {
        constructor(public data: any) {
          this.buttons = data.buttons;
        }
        buttons: any;
        render = vi.fn();
      },
    },
  },
  applications: {
    api: {
      ApplicationV2: class {
        async close(_options = {}) {}
      },
      HandlebarsApplicationMixin: (Base: any) => class extends Base {},
    },
  },
  utils: {
    randomID: vi.fn().mockReturnValue("randomid"),
    expandObject: vi.fn((obj: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const parts = key.split(".");
        let curr = result;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!(part in curr)) curr[part] = {};
          curr = curr[part];
        }
        curr[parts[parts.length - 1]] = value;
      }
      return result;
    }),
    getProperty: vi.fn((obj: any, path: string) => {
      return path.split(".").reduce((o, i) => (o ? o[i] : undefined), obj);
    }),
    mergeObject: vi.fn((target: any, source: any) => {
      for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          if (!target[key]) target[key] = {};
          globalThis.foundry.utils.mergeObject(target[key], value);
        } else {
          target[key] = value;
        }
      }
      return target;
    }),
    escapeHTML: vi.fn((str: string) => {
      if (!str) return str;
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }),
  },
} as any;

export class ActorsCollection extends Array<any> {
  get = vi.fn((id: string) => this.find((a) => a.id === id));
}

export class PacksCollection extends Array<any> {
  get = vi.fn((id: string) => this.find((p) => p.metadata.id === id));
}

globalThis.game = {
  settings: {
    register: vi.fn(),
    registerMenu: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
  user: { isGM: false },
  actors: new ActorsCollection(),
  packs: new PacksCollection(),
  ID: "thefehrs-learning-manager",
} as any;

globalThis.Handlebars = {
  registerHelper: vi.fn(),
} as any;

class MockActor {
  id = "mock-id";
  name = "Mock Actor";
  flags: any = {};
  system: any = {};
  items: any[] = [];

  getFlag(scope: string, key: string) {
    return this.flags?.[scope]?.[key];
  }

  async setFlag(scope: string, key: string, value: any) {
    if (!this.flags[scope]) this.flags[scope] = {};
    this.flags[scope][key] = value;
    return this;
  }

  async update(data: any) {
    foundry.utils.mergeObject(this, data);
    return this;
  }

  async createEmbeddedDocuments(type: string, data: any[]) {
    return data.map((d) => ({ ...d, id: foundry.utils.randomID() }));
  }
}
vi.spyOn(MockActor.prototype, "setFlag");
vi.spyOn(MockActor.prototype, "update");
vi.spyOn(MockActor.prototype, "createEmbeddedDocuments");

globalThis.Actor = MockActor as any;

globalThis.Item = class {} as any;
globalThis.ActiveEffect = class {} as any;

globalThis.Hooks = {
  on: vi.fn(),
  once: vi.fn(),
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
  constructor(public data: any) {
    this.buttons = data.buttons;
  }
  buttons: any;
  render = vi.fn();
} as any;
globalThis.ChatMessage = {
  create: vi.fn(),
} as any;
globalThis.fromUuid = vi.fn();
globalThis.CompendiumCollection = {
  createCompendium: vi.fn(),
} as any;

globalThis.CONFIG = {
  DND5E: {
    featureTypes: {},
  },
} as any;

vi.mock("svelte", () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
}));
