import type { ActivityData5e } from "../types.js";

export function createBaseActivityTemplate(): Omit<
  ActivityData5e,
  "name" | "img" | "sort" | "_id"
> {
  return {
    override: false,
    concentration: false,
    prompt: false,
    type: "utility",
    activation: {
      type: "special",
      override: false,
      condition: "",
      value: 1,
    } as any,
    consumption: {
      value: "1",
      scaling: {
        allowed: false,
        max: "",
      },
      spellSlot: false,
      targets: [],
    } as any,
    description: {
      chatFlavor: "",
    },
    duration: {
      value: "1",
      units: "perm",
      concentration: false,
      override: false,
      special: "",
    } as any,
    effects: [],
    flags: {},
    range: {
      value: "0",
      units: "self",
      override: false,
      special: "",
    } as any,
    target: {
      template: {
        count: "1",
        size: "0",
        width: "0",
        height: "0",
        contiguous: false,
        units: "ft",
        type: "",
      },
      affects: {
        count: "1",
        choice: false,
        type: "",
        special: "",
      },
      override: false,
      prompt: false,
    } as any,
    uses: {
      spent: 0,
      recovery: [],
      max: "",
    },
    visibility: {
      identifier: "",
      level: {
        min: null,
        max: null,
      },
      requireAttunement: false,
      requireIdentification: false,
      requireMagic: false,
    },
  };
}
