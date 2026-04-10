# Feature Plan: Tutelage Selection & Detection System

## Overview

Improve the tutelage system by introducing "Learning Books" (Items) and "Instructors" (Actors). The system will automatically detect applicable books in a player's inventory and allow users to choose an instructor for each learning session from a configured world compendium.

## Core Rules

- **Best Modifier Wins**: The effective tutelage modifier for a session is the `max(chosenInstructorModifier, bestBookModifier)`.
- **Instructors have Costs**: Choosing an instructor (other than "Self-Study") requires spending currency based on their offering.
- **Instructor Choice per Session**: The instructor is chosen at the start of each training/spending session, allowing flexibility as players find better teachers or run low on gold.
- **Implicit Self-Study**: There is an implicit "+0 (Self-Study)" level that is always available. It no longer exists as a configurable option in the settings or as a specific learning feat. It serves as the baseline fallback for all projects.
- **Permanent Books**: Learning Books are permanent bonuses and are not consumed upon use. They provide their bonus as long as they remain in the Actor's inventory.

## Implementation Packages

### 1. Data Model & Flag Structure

- **Teacher Actor Flags**: `thefehrs-learning-manager.teacherOfferings`
  - Structure: `Array<{ name: string, modifier: number, costs: Record<string, number>, categories: string[] }>`
  - `costs` maps `TimeUnit` IDs to costs in CP (Copper Pieces).
  - `categories`: List of project categories (e.g., "Feat", "Language", "Tool") to match against the project.
- **Learning Book Item Flags**: `thefehrs-learning-manager.learningBookBonus`
  - Structure: `{ modifier: number, categories: string[] }`
- **Project Progress Flags**: Update `ProjectFlagData` to store the `lastInstructorUuid` (optional, for UI persistence).

### 2. Provider Discovery & Configuration

- **Settings**: Add a module setting `teacherCompendiums` (string[]) to specify the Actor compendiums containing instructors. The previous `guidanceTiers` setting is removed; the "+0 (Self-Study)" level is now implicit and no longer configurable.
- **Tutelage Resolver Service**:
  - `getAvailableInstructors(actor, projectItem)`: Scans the configured compendiums for Actors with teacher flags matching the project. Uses a global cache of instructors to avoid redundant compendium scanning.
  - `getAvailableBooks(actor, projectItem)`: Scans the Actor's inventory for Items with book flags matching the project.
  - `resolveTutelage(actor, projectItem, selectedInstructorId)`: Returns the final modifier and cost.
  - **Caching Strategy**: The service will maintain a global `instructorCache` built on first access.
    - **Auto-Invalidation**: Clear the cache if `teacherCompendiums` settings change.
    - **Manual Refresh**: Add a "Refresh Tutelage Cache" button to the GM's module settings.

### 3. Selection UI & Training Flow

- **Instructor Selection Dialog**: Update the training flow in `ProjectEngine` to prompt the user to select an instructor if multiple are available. Include a "Remember Choice" checkbox to automatically use the selected instructor for future sessions of the same project.
- **Project/Instructor Matching UI**: Implement a user-friendly UI for DMs to easily add multiple categories to a teacher's offering or a book's bonus list.
- **Currency Deduction**: Ensure `TabLogic.deductCurrency` is called with the selected instructor's cost before progress is applied.
- **UI Simplicity**: The best available book bonus will be _included_ in the overall tutelage calculation, but will not be displayed in the Party Tab. The Party Tab should no longer show a "Tutor/Guidance" column as tutelage is now a per-session choice.

### 4. Progress Logic & UI Integration

- **TabLogic**: Update `computeProgress` to accept the resolved tutelage modifier instead of reading it directly from a fixed project tier.

### 5. Migration Tooling

- **Dry Run Report**: Provide a summary of expected changes (Actors affected, Items to be created, orphaned IDs found) before executing the migration.
- **Orphaned ID Handling**: Gracefully handle `tutelageId` values that no longer exist in the system settings by defaulting them to "Self-Study" and logging them in the migration report.
- **Recovery Compendium Creation**: Logic to create `Legacy Tutelage: Books` (Item) and `Legacy Tutelage: Instructors` (Actor) compendiums.
- **Tier-to-Document Conversion**:
  - Identify used `tutelageId`s in world projects.
  - Convert `GuidanceTier` objects into either Instructor Actors (if costs are present) or Learning Book Items (if no costs).
  - **Inventory Injection**: For projects using a "Book" tier, create the new Learning Book item directly in the owning Actor's inventory to maintain existing bonuses.
- **Flag Updates**: Clean up legacy `tutelageId` flags and initialize new `lastInstructorUuid` references where a matching Instructor was created.

### 6. Documentation & Help

- **README.md**:
  - Update "Key Features" to replace "Custom Tutelage Matrix" with "**Dynamic Instructor & Book System**".
  - Explain that instructors are now Actors in compendiums and books are Items in inventory.
  - Explicitly mention the **Implicit Self-Study (+0)** baseline which replaces the previous configurable settings.
- **In-App Help & Tooltips**:
  - Add tooltips to the **Instructor Selection Dialog** explaining the `max(instructor, book)` modifier logic.
  - Update any remaining UI text that refers to "Guidance Tiers" to use "Instructors" or "Tutelage" instead.

## Migration & Recovery Strategy

The migration from the fixed `guidanceTiers` system to the dynamic Provider system will follow these steps:

1. **Analyze**: Scan all items in the world and compendiums for the `thefehrs-learning-manager.projectData.tutelageId` flag.
2. **Collect**: Aggregate unique `GuidanceTier` configurations currently in use. Identify orphaned `tutelageId`s that no longer match the settings.
3. **Dry Run Report**: Present the GM with a summary of discovered tiers, orphaned IDs, and proposed document creations/injections.
4. **Generate Recovery Docs**:
   - For each used tier not matching the new "Global/Base" defaults:
     - Create an **Actor** (Instructor) if the tier specifies costs.
     - Create an **Item** (Learning Book) if the tier specifies 0 cost but >0 modifier.
5. **Distribute**:
   - If a tier was converted to a **Book**, create an instance of that Book item on every Actor who has a project currently using that tier.
6. **Update**: Update project flags to ensure they point to the new Instructor Actor (by `lastInstructorUuid`) or revert to the implicit "Self-Study" (+0) while relying on the newly added Books for the modifier.
