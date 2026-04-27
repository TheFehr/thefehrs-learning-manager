# The Fehrs Learning Manager

A custom Downtime Engine and Learning Manager for Foundry VTT. This module integrates seamlessly into the **Tidy5e** character sheet, providing a robust, highly configurable system for tracking downtime learning, training projects, and tutelage.

Whether your players are learning a new language, training a feat, or mastering a tool proficiency, this module handles the time management, cost calculation, and progress tracking automatically.

---

## 🌟 Key Features

### For the Game Master

- **Intuitive Configuration UI:** Manage scaling matrices, learning rates, and tutelage modifiers directly in Foundry. While everything is backed by flexible JSON data, all management is done through a user-friendly settings panel.
- **Custom Tutelage Matrix:** Define effectiveness and costs for different teachers (e.g., _Self-Taught_, _Amateur_, _Professional_).
- **Project Library & Dynamic Rewards:** Pre-define standard projects and attach UUIDs to auto-grant Items or Active Effects upon completion.
- **Requirement System:** Set attribute-based conditions (e.g., `Intelligence >= 13`) for project participation.
- **Party Time Management:** A dedicated "Group Learning" tab on Party/Group actors for distributing time and tracking all party members' progress at once.

### For the Players

- **Native Tidy5e Integration:** A dedicated "Time Bank" footer in the **Features** tab for managing available downtime (configurable units).
- **Project-Based Learning:** Any Item (Feature, Tool, etc.) can be converted into a Learning Project.
- **Dynamic Progress Tracking:** Project names and descriptions update automatically to show current progress and active instructors.
- **Resolution Choice:** Choose between "Bulk" or "Separate" resolution when spending large time units.
- **Teacher & Book Discovery:** Automatically detects nearby tokens acting as instructors or books in inventory that grant bonuses.

---

## 👥 Party Management & Time Distribution

While players manage their own projects, the Game Master can oversee the entire party and distribute training time through the **Group Learning** tab on any **Group/Party actor**.

- **Batch Distribution:** GMs can open the "Distribute Time" dialog to add (or deduct) time from multiple players simultaneously. This is the primary way for GMs to grant downtime rewards after a session or adventure.
- **Party-Wide Overview:** See every character's active projects, current progress, and time bank status in a single unified view.
- **Manual Overrides:** GMs can manually adjust progress or targets for any character's project directly from this tab.

---

## 🎲 Training Mechanics

The Downtime Engine supports three primary ways to resolve training:

1.  **Direct Resolution:** Progress is gained at a 1:1 ratio with time spent. Spend 1 hour, gain 1 progress.
2.  **Roll Resolution:** Standard d20-based checks. GMs can configure the formula (e.g., `1d20 + @abilities.int.mod + @tutelage`), the DC (default **12**), and critical success strategies.
3.  **Mathematical (Bulk) Resolution:** For large blocks of time, the engine can use a statistical formula to calculate the expected progress. This avoids rolling dozens of times for a large training session (e.g., a "Week" of downtime) while maintaining mathematical fairness.
    - _Default Formula:_ `round(@hours * (22 - max(1, @dc - @mod)) / 20)`

### Bulk vs. Separate Resolution

When spending a "Bulk" time unit (like a **Day** composed of multiple **Hours**), players can choose:

- **Bulk:** A single roll (or calculation) for the entire block.
- **Separate:** Multiple individual rolls. The engine can summarize these to keep the chat clean.

---

## 👨‍🏫 Tutelage & Guidance

Progress isn't just about time; it's about who is teaching you.

- **Instructors:** The module automatically scans your configured "Teacher Compendiums" for eligible instructors who can provide guidance.
- **Books:** Items in your inventory can also provide "Tutelage" modifiers if they match configured criteria.
- **Cost Calculation:** Better teachers might yield more progress but cost more Gold, Silver, or Copper per hour.

---

## 🛠️ In-Game Configuration

### 1. Module Settings

Configure global rules, default DC, critical success behavior, and your custom "Time Units" (e.g., Hour = 1, Day = 10, Week = 70).

### 2. Project Setup (Item Sheet)

Any Item can be turned into a "Learning Project." Configure its target goal, requirements, and what happens when it's finished.

- **Auto-grant Rewards:** Automatically grant an Item or Active Effect upon completion.
- **Follow-up Projects:** Link projects together. When "Basic Blacksmithing" finishes, "Advanced Smithing" can automatically become the active project.

---

## 🛠️ Development & Workflow

For information on how to set up the development environment, code quality standards, and the release process, please see [DEVELOPMENT.md](./DEVELOPMENT.md).
