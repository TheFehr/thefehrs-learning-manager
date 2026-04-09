# Development Guidelines

## Migrations

### Stability and Isolation

- **No Production Code in Migrations**: Migrations must never import or use production logic classes, services, or managers (e.g., `Settings`, `ActivityManager`, `ActorProxy`).
- **Reasoning**: Production code is subject to refactoring and changes. Historical migrations must remain stable over time. If a migration depends on production code that is later changed or removed, the migration will break for users updating from older versions.
- **Implementation**:
  - Use low-level Foundry APIs directly (e.g., `game.settings.get`, `game.settings.set`, `actor.setFlag`).
  - Define necessary interfaces or types locally within the migration file to represent the data structure as it existed at the time of the migration.
  - Use constants like `MODULE_ID` if they are considered stable and unlikely to change.

## Code Quality & Reviews

- **Address Findings Safely**: When addressing CodeRabbit or other AI review findings, ensure that suggested improvements (like adding type safety or using managers) do not violate the isolation rules for migrations.
