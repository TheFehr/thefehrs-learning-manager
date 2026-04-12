import { vi } from "vitest";
import { MODULE_ID } from "../src/global";

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
        element = document.createElement("div");
        async close(_options = {}) {}
      },
      HandlebarsApplicationMixin: (Base: any) => class extends Base {},
      DialogV2: {
        confirm: vi.fn().mockResolvedValue(true),
        wait: vi.fn(),
      },
    },
  },
  utils: {
    deepClone: vi.fn((obj: any) => {
      if (!obj || typeof obj !== "object") return obj;
      return JSON.parse(JSON.stringify(obj));
    }),
    randomID: vi.fn().mockReturnValue("randomid"),
    isNewerVersion: vi.fn((newer: string, current: string) => {
      if (newer === current) return false;
      const n = newer.split(".").map(Number);
      const c = current.split(".").map(Number);
      for (let i = 0; i < Math.max(n.length, c.length); i++) {
        if ((n[i] || 0) > (c[i] || 0)) return true;
        if ((n[i] || 0) < (c[i] || 0)) return false;
      }
      return false;
    }),
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
  dice: {
    terms: {
      Die: class {
        constructor(public data: any) {
          this.faces = data.faces;
          this.number = data.number;
          this.results = data.results || [];
        }
        faces: number;
        number: number;
        results: any[];
        _evaluated = false;
      },
    },
  },
} as any;

globalThis.Roll = class {
  constructor(
    public formula: string,
    public data: any = {},
  ) {}
  dice: any[] = [];
  terms: any[] = [];
  total = 0;
  _evaluated = false;
  async evaluate() {
    if (this._evaluated) return this;

    const tokens = this.formula.split(/([+\-*/])/);
    let t = 0;
    let op = "+";

    for (const token of tokens) {
      const trimmed = token.trim();
      if (!trimmed) continue;

      if (["+", "-", "*", "/"].includes(trimmed)) {
        op = trimmed;
        continue;
      }

      let val = 0;
      if (trimmed.startsWith("@")) {
        val = Number(this.data[trimmed.slice(1)]) || 0;
      } else if (trimmed.includes("d")) {
        // Find corresponding Die term if available
        const dieTerm = this.terms.find(
          (t) => t instanceof foundry.dice.terms.Die && t.formula === trimmed,
        );
        if (dieTerm) {
          val =
            dieTerm.results?.reduce(
              (s: number, r: any) => s + (r.active !== false ? r.result : 0),
              0,
            ) || 0;
        } else if (this.dice.length > 0) {
          // Fallback to searching this.dice if terms aren't populated
          const d = this.dice.find((d) => d.faces === 20); // Common case for these tests
          val =
            d?.results?.reduce((s: number, r: any) => s + (r.active !== false ? r.result : 0), 0) ||
            0;
        } else {
          val = 10; // Default die result
        }
      } else {
        val = Number(trimmed) || 0;
      }

      if (op === "+") t += val;
      else if (op === "-") t -= val;
      else if (op === "*") t *= val;
      else if (op === "/") t /= val;
    }

    this.total = t;
    this._evaluated = true;
    return this;
  }
  static fromTerms(terms: any[]) {
    const formula = terms.map((t) => t.formula || String(t.total || t.result || "")).join(" ");
    const r = new globalThis.Roll(formula);
    r.terms = [...terms];
    r.dice = terms.filter((t) => t instanceof foundry.dice.terms.Die);
    return r;
  }
  clone() {
    const cloned = new globalThis.Roll(this.formula, this.data);
    // Manually clone dice and terms to preserve class instances (prototypes)
    cloned.dice = this.dice.map((d) => {
      if (d instanceof foundry.dice.terms.Die) {
        return new foundry.dice.terms.Die({
          faces: d.faces,
          number: d.number,
          results: [...(d.results || [])],
        });
      }
      return { ...d };
    });
    cloned.terms = this.terms.map((t) => {
      if (t instanceof foundry.dice.terms.Die) {
        return new foundry.dice.terms.Die({
          faces: t.faces,
          number: t.number,
          results: [...(t.results || [])],
        });
      }
      return { ...t };
    });
    cloned.total = this.total;
    cloned._evaluated = this._evaluated;
    return cloned;
  }
  toMessage = vi.fn().mockResolvedValue({});
} as any;

export class ActorsCollection extends Array<any> {
  get contents() {
    return this;
  }
  get = vi.fn((id: string) => this.find((a) => a.id === id));
}

export class PacksCollection extends Array<any> {
  get = vi.fn((id: string) => this.find((p) => p.metadata?.id === id));
}

globalThis.game = {
  settings: {
    register: vi.fn(),
    registerMenu: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    settings: new Map(),
  },
  i18n: {
    localize: vi.fn((key: string) => key),
  },
  user: { isGM: false },
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
  actors: new ActorsCollection(),
  packs: {
    contents: [],
    get: vi.fn(),
  },
  modules: {
    get: vi.fn(),
  },
  ID: MODULE_ID,
} as any;

export function toggleUserGM(isGM: boolean) {
  (globalThis.game as any).user.isGM = isGM;
}

globalThis.Handlebars = {
  registerHelper: vi.fn(),
} as any;

export class EmbeddedCollection extends Array<any> {
  get = vi.fn((id: string) => this.find((i) => i.id === id || i._id === id));
}

class MockActor {
  id = "mock-id";
  name = "Mock Actor";
  flags: any = {};
  system: any = {};
  items = new EmbeddedCollection();

  getFlag = vi.fn((scope: string, key: string) => {
    return this.flags?.[scope]?.[key];
  });

  getRollData = vi.fn(() => this.system);

  setFlag = vi.fn(async (scope: string, key: string, value: any) => {
    if (!this.flags[scope]) this.flags[scope] = {};
    this.flags[scope][key] = value;
    return this;
  });

  update = vi.fn(async (data: any) => {
    foundry.utils.mergeObject(this, data);
    return this;
  });

  createEmbeddedDocuments = vi.fn(async (type: string, data: any[]) => {
    const created = data.map((d) => {
      const createdItem: any = {
        ...d,
        id: d.id || d._id || foundry.utils.randomID(),
        actor: this,
        getFlag: (scope: string, key: string) =>
          createdItem.flags?.[scope]?.[key] ?? createdItem[`flags.${scope}.${key}`],
        update: vi.fn(),
        delete: vi.fn(),
        displayCard: vi.fn(),
      };
      createdItem.update.mockImplementation(async (upd: any) =>
        foundry.utils.mergeObject(createdItem, upd),
      );
      return createdItem;
    });
    if (type === "Item") {
      this.items.push(...created);
    }
    return created;
  });
}

globalThis.Actor = MockActor as any;

class MockItem {
  id = "mock-item-id";
  name = "Mock Item";
  type = "feat";
  img = "";
  system = { description: { value: "" }, activities: new EmbeddedCollection() };
  flags = {};
  actor = null;

  toObject() {
    return JSON.parse(JSON.stringify(this));
  }
  getFlag = vi.fn((scope: string, key: string) => {
    return (this.flags as any)[scope]?.[key];
  });
  update = vi.fn(async (data: any) => {
    foundry.utils.mergeObject(this, data);
    return this;
  });
  displayCard = vi.fn();
}
globalThis.Item = MockItem as any;

class MockActiveEffect {
  id = "mock-effect-id";
  name = "Mock Effect";
  toObject() {
    return JSON.parse(JSON.stringify(this));
  }
}
globalThis.ActiveEffect = MockActiveEffect as any;

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
  Dice: {
    rollModes: {
      publicroll: "CHAT.RollPublic",
      gmroll: "CHAT.RollPrivate",
      blindroll: "CHAT.RollBlind",
      selfroll: "CHAT.RollSelf",
    },
  },
} as any;

vi.mock("svelte", () => ({
  mount: vi.fn().mockReturnValue({}),
  unmount: vi.fn(),
  tick: vi.fn().mockResolvedValue(undefined),
  untrack: vi.fn((fn: any) => fn()),
}));
