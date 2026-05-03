import type {
  ActivityData5e,
  ActivationData5e,
  ConsumptionData5e,
  DurationData5e,
  RangeData5e,
  TargetData5e,
} from "@/types.js";
import { Logger } from "./logger.js";

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
      value: null as unknown as number,
    } as ActivationData5e,
    consumption: {
      value: "",
      scaling: {
        allowed: false,
        max: "",
      },
      spellSlot: false,
      targets: [],
    } as unknown as ConsumptionData5e,
    description: {
      chatFlavor: "",
    },
    duration: {
      value: "",
      units: "perm",
      concentration: false,
      override: false,
      special: "",
    } as DurationData5e,
    effects: [],
    flags: {},
    range: {
      value: null as unknown as string,
      units: "self",
      override: false,
      special: "",
    } as RangeData5e,
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
    } as TargetData5e,
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
