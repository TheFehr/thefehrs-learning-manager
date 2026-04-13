import { vi } from "vitest";

export interface MockRollConfig {
  total?: number;
  dice?: any[];
  terms?: any[];
  data?: any;
}

function evaluateFormula(formula: string, data: any) {
  let val = 0;
  let dice: any[] = [];
  if (formula.includes("2d20")) {
    dice = [
      {
        faces: 20,
        number: 2,
        modifiers: ["kh1"],
        results: [{ result: 15, active: true }],
      },
    ];
    val = 15;
  } else if (formula.includes("1d20") || formula.includes("d20")) {
    dice = [
      {
        faces: 20,
        number: 1,
        modifiers: [],
        results: [{ result: 15, active: true }],
        _evaluated: true,
      },
    ];
    val = 15;
  }

  // Basic formula parser for tests
  const tokens = formula.split(/([+\-*/()])/);
  let t = 0;
  let op = "+";

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed || ["(", ")"].includes(trimmed)) continue;

    if (["+", "-", "*", "/"].includes(trimmed)) {
      op = trimmed;
      continue;
    }

    let tokenVal = 0;
    if (trimmed.startsWith("@")) {
      const path = trimmed.slice(1);
      tokenVal = path.split(".").reduce((o, i) => (o ? o[i] : undefined), data) || 0;
    } else if (trimmed.includes("d")) {
      tokenVal = val || 10;
    } else {
      // Basic extraction of numbers from tokens like "round" or "20)"
      tokenVal = Number(trimmed.replace(/[^\d.]/g, "")) || 0;
    }

    if (op === "+") t += tokenVal;
    else if (op === "-") t -= tokenVal;
    else if (op === "*") t *= tokenVal;
    else if (op === "/") {
      if (tokenVal === 0) {
        // If we're in a bulk formula, we don't care about the intermediate result
        // as it will be overwritten anyway. Just set to 0.
        if (formula.includes("@hours")) {
          t = 0;
          break;
        }
        throw new Error(
          `division by zero in roll evaluation for token "${trimmed}" in formula "${formula}"`,
        );
      }
      t /= tokenVal;
    }
  }

  // Handle bulk formula logic from tab-logic.test.ts
  if (formula.includes("@hours")) {
    const hours = data?.hours || 0;
    const dc = data?.dc || 0;
    const tutelage = data?.tutelage || 0;
    const mod = data?.mod;
    const intMod = data?.abilities?.int?.mod || 0;
    const effectiveMod = mod ?? intMod + tutelage;
    const minRoll = Math.max(1, dc - effectiveMod);
    t = Math.round((hours * (22 - minRoll)) / 20);
  }

  return { total: t, dice };
}

export function createMockRoll(formula: string, config: MockRollConfig = {}) {
  return new (class {
    formula = formula;
    data = config.data || {};
    dice = config.dice || [];
    terms = config.terms || [];
    total = config.total || 0;
    _evaluated = false;

    async evaluate() {
      if (this._evaluated) return this;

      if (!this.total || !this.dice?.length) {
        const res = evaluateFormula(this.formula, this.data);
        if (!this.total) this.total = res.total;
        if (!this.dice?.length) this.dice = res.dice;
      }
      this._evaluated = true;
      return this;
    }

    static fromTerms(terms: any[]) {
      const formula = terms.map((t) => t.formula || String(t.total || t.result || "")).join(" ");
      const r = createMockRoll(formula, { terms });
      r.dice = terms.filter((t) => t.faces);
      return r;
    }

    clone() {
      return createMockRoll(this.formula, {
        total: this.total,
        dice: [...this.dice],
        terms: [...this.terms],
        data: JSON.parse(JSON.stringify(this.data)),
      });
    }

    toMessage = vi.fn().mockResolvedValue({});
  })();
}

/**
 * A class-based version of the Roll mock for use where 'new Roll()' is required.
 */
export class MockRoll {
  formula: string;
  data: any;
  dice: any[] = [];
  terms: any[] = [];
  total = 0;
  _evaluated = false;

  constructor(formula: string, data: any = {}) {
    this.formula = formula;
    this.data = data;
  }

  async evaluate() {
    if (this._evaluated) return this;

    if (!this.total || !this.dice?.length) {
      const res = evaluateFormula(this.formula, this.data);
      if (!this.total) this.total = res.total;
      if (!this.dice?.length) this.dice = res.dice;
    }
    this._evaluated = true;
    return this;
  }

  static fromTerms(terms: any[]) {
    const formula = terms.map((t) => t.formula || String(t.total || t.result || "")).join(" ");
    const r = new MockRoll(formula);
    r.terms = [...terms];
    r.dice = terms.filter((t) => t.faces);
    return r;
  }

  clone() {
    const r = new MockRoll(this.formula, JSON.parse(JSON.stringify(this.data)));
    r.total = this.total;
    r._evaluated = this._evaluated;
    r.dice = [...this.dice];
    r.terms = [...this.terms];
    return r;
  }

  toMessage = vi.fn().mockResolvedValue({});
}
