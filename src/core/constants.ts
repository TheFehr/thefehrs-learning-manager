import type { ActivityData5e } from "@/types.js";
import { Logger } from "@/core/logger.js";

export function createBaseActivityTemplate(): Omit<
  ActivityData5e,
  "name" | "img" | "sort" | "_id"
> {
  Logger.debug("Creating base activity template");
  return {
    override: false,
    concentration: false,
    prompt: false,
    type: "utility",
    activation: {
      type: "special",
      override: false,
      condition: "",
      value: null,
    } as any,
    consumption: {
      value: null,
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
      value: "",
      units: "perm",
      concentration: false,
      override: false,
      special: "",
    } as any,
    effects: [],
    flags: {},
    range: {
      value: null,
      units: "self",
      override: false,
      special: "",
    } as any,
    target: {
      template: {
        count: "",
        size: "",
        width: "",
        height: "",
        contiguous: false,
        units: "",
        type: "",
      },
      affects: {
        count: "",
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
