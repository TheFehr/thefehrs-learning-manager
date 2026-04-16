# Development & Workflow

This project utilizes `vite` and `vite-plugin-fvtt` for lightning-fast Hot Module Replacement (HMR).

## 💻 Development Setup

### 1. Prerequisites

Ensure you have Node.js installed. Clone the repository and install the dependencies:

```bash
npm install
```

### 2. Code Quality & Hooks

- **Pre-commit Hook:** A Git `pre-commit` hook is automatically configured via Husky.
- **Automatic Formatting:** On every commit, `lint-staged` runs `npm run fmt` (powered by `oxfmt`).

---

## 🚀 Releasing a New Version

1. Run `npm run release`.
2. Select the next version (Patch, Minor, Major).
3. The GitHub Action will automatically build and create a release on GitHub.

---

## 📜 Development Guidelines

### Migrations

#### Stability and Isolation

- **No Production Code in Migrations**: Migrations must never import or use production logic classes, services, or managers (e.g., `Settings`, `ActivityManager`, `ActorProxy`).
- **Reasoning**: Production code is subject to refactoring and changes. Historical migrations must remain stable over time. If a migration depends on production code that is later changed or removed, the migration will break for users updating from older versions.
- **Implementation**:
  - Use low-level Foundry APIs directly (e.g., `game.settings.get`, `game.settings.set`, `actor.setFlag`).
  - **Stable Infrastructure**: Constants like `MODULE_ID` and the `Logger` utility (from `src/core/logger.ts`) are considered stable and are safe to import in migrations.
  - **Data Structures**: Define necessary interfaces or types locally within the migration file to represent the data structure as it existed at the time of the migration.

#### Handling Legacy Settings

When a migration needs to access a setting that has been removed from the current `SettingsSchema` or global `SettingConfig`:

- **Do NOT** keep the legacy key in the global `SettingConfig` interface in `src/types.ts`.
- **Augment locally**: Use TypeScript's module augmentation to add the legacy key to the `SettingConfig` interface _inside_ the migration file.
- **Example**:
  ```typescript
  declare module "fvtt-types/configuration" {
    interface SettingConfig {
      "thefehrs-learning-manager.legacySettingKey": any;
    }
  }
  ```
- **Registration**: Ensure the legacy setting is registered (e.g., in `migration.ts` or at the start of the migration function) using `game.settings.register` to avoid runtime errors when calling `game.settings.get`.

### Foundry VTT Version & Application Architecture

This project exclusively supports **Foundry VTT V12+** and utilizes the **ApplicationV2** framework for all user interfaces.

- **Exclusion of Application V1**: Legacy `Application` (V1), `FormApplication`, and related legacy classes must not be used for new development.
- **Lifecycle Management**: All UI components are built with Svelte 5 and mounted within `ApplicationV2` windows.
- **Cleanup Requirement**: Global cleanup is managed via the `closeApplicationV2` hook in `LearningManager.ts`. Any new Svelte-mounted components that exist outside a standard `ApplicationV2` lifecycle (e.g., injected content) must ensure their IDs are tracked in `LearningManager.svelteInstances` to be correctly unmounted when their parent sheet closes.

### Code Quality & Reviews

- **Address Findings Safely**: When addressing CodeRabbit or other AI review findings, ensure that suggested improvements (like adding type safety or using managers) do not violate the isolation rules for migrations.

### Verification before Submission

To ensure project stability and type safety, **always** run the following commands before claiming a task is complete:

1.  **Type Checking**: Run `npx tsc --noEmit` to ensure there are no TypeScript errors.
2.  **Tests**: Run `npm run test` to ensure all Vitest tests pass.
3.  **Linting**: Run `npm run lint` and `npm run fmt:check` to ensure code style compliance.
