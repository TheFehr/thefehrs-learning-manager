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

Releases are automatic and driven by conventional commits (use `feat:`, `fix:`, `perf:`, and `!` / `BREAKING CHANGE:` for major).

1. Once a day (or via _Run workflow_ on **Release PR**), the workflow looks at the commits since the last tag. Dependency updates (bot commits, `(deps)` scopes) never count; `feat` bumps the minor version, `fix`/`perf` the patch, a breaking change the major. `docs`, `chore`, `ci` and `test` alone do not trigger a release.
2. If a release is due, it opens a `chore: release vX.Y.Z` PR labelled `release` and enables auto-merge. The PR is rebuilt on top of `main` whenever `main` moves.
3. The PR merges itself once CI and the local e2e verification (the `e2e-gate` check, satisfied by an `e2e/local` commit status posted for the exact PR head SHA) are green and the branch is up to date.
4. Merging tags `vX.Y.Z`, which starts the **CI/CD Pipeline** release job (GitHub Release and Foundry package notification).

Required repository setup: the `CLIENT_ID` / `APP_PRIVATE_KEY` secrets of a GitHub App with contents and pull-request write access, "Allow auto-merge", and branch protection on `main` requiring `test` and `e2e-gate` plus up-to-date branches. `e2e-gate` passes at once on ordinary PRs and, on the release PR, only once its head commit has a successful `e2e/local` status.

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

This project exclusively supports **Foundry VTT V13+** and utilizes the **ApplicationV2** framework for all user interfaces.

- **Exclusion of Application V1**: Legacy `Application` (V1), `FormApplication`, and related legacy classes must not be used for new development.
- **Lifecycle Management**: All UI components are built with **Svelte 5** and mounted within `ApplicationV2` windows using the `mount`/`unmount` API.
- **Cleanup Requirement**: Global cleanup is managed via the `closeApplicationV2` hook in `LearningManager.ts`. Any new Svelte-mounted components that exist outside a standard `ApplicationV2` lifecycle (e.g., injected content) must ensure their IDs are tracked in `LearningManager.svelteInstances` to be correctly unmounted when their parent sheet closes.

### Code Quality & Reviews

- **Address Findings Safely**: When addressing CodeRabbit or other AI review findings, ensure that suggested improvements (like adding type safety or using managers) do not violate the isolation rules for migrations.

### Verification before Submission

To ensure project stability and type safety, **always** run the following commands before claiming a task is complete:

1.  **Type Checking**: Run `npm run typecheck` to ensure there are no TypeScript errors.
2.  **Tests**: Run `npm run test` to ensure all Vitest tests pass.
3.  **Manual E2E Testing**:
    - Copy `.env.example` to `.env`.
    - Configure `FOUNDRY_URL`, `FOUNDRY_E2E_WORLD`, and `FOUNDRY_E2E_USER`.
    - **Note:** `FOUNDRY_URL` must point to the Vite dev-server (e.g., `http://localhost:30004`) so that Playwright can access the built module assets.
    - Ensure your local FoundryVTT is running and the test world has the module enabled.
    - Run `npm run test:e2e` to execute the Playwright tests.
    - Run `npm run test:e2e:ui` to open the Playwright UI for debugging.
    - Run `npm run test:e2e:verify:local` to perform the full verification suite without committing anything (loads `.env` via Node's `--env-file-if-exists`; `test:e2e:verify` itself expects credentials already in the environment).
4.  **Linting**: Run `npm run lint` and `npm run fmt:check` to ensure code style compliance.

### Running the e2e suite on a PR (opt-in)

Ordinary PRs are not e2e-verified automatically: the suite takes about 45 minutes against a real Foundry install. To check a large change before it reaches `main`, add the **`e2e`** label to a PR from this repository once its `test` check is green. The verification machine picks it up within a few minutes and reports on the PR's head commit:

- The `e2e/local` commit status shows progress while the run is going (phase, minutes, and a finished-test counter) and the result at the end.
- A failure adds a PR comment. A commit that has failed twice is not retried until it gets a new commit.
- A new push is verified again while the label stays on.

The result is informational: only the release PR is gated on `e2e/local` (`e2e-gate`). The machine verifies one commit at a time, in this order: the release PR, labelled PRs (oldest first), then `main`. PRs from forks are never run.
