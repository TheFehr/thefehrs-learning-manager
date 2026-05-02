# Universal Downtime Engine

A robust, highly configurable Downtime and Learning Manager for Foundry VTT. This module integrates seamlessly into the **Tidy5e** character sheet and utilizes native **D&D 5e Activities** to provide a modern, automated system for tracking training, masteries, and custom downtime projects.

Whether your players are learning a new language, training a feat, or mastering a tool proficiency, this engine handles time management, cost calculation, and progress tracking automatically.

---

## 🌟 Key Features

### For the Game Master

- **Native D&D 5e Integration:** Projects are represented as Items with dedicated **Activities** for training.
- **Intuitive Configuration UI:** Manage scaling matrices, learning rates, and tutelage modifiers directly in Foundry through a user-friendly settings panel.
- **Custom Tutelage Matrix:** Define effectiveness and costs for different teachers (e.g., _Self-Taught_, _Amateur_, _Professional_).
- **Project Library & Dynamic Rewards:** Pre-define standard projects and attach UUIDs to auto-grant Items or Active Effects upon completion.
- **Requirement System:** Set attribute or skill-based conditions (e.g., `@abilities.int.value >= 13`) for project participation.
- **Party Time Management:** A dedicated "Group Learning" tab on Party/Group actors for distributing time and tracking all party members' progress at once.

### For the Players

- **Native Tidy5e Integration:** A dedicated "Time Bank" footer in the **Features** tab for managing available downtime.
- **Activity-Based Training:** Use standard item activities to spend downtime. Training is as simple as clicking an activity on your character sheet.
- **Auto-Spend:** Optionally enable "Auto-spend granted time" in User Preferences to automatically apply downtime rewards from the GM to your active project.
- **Dynamic Progress Tracking:** Project items update automatically to show current progress, active instructors, and remaining requirements.
- **Teacher & Book Discovery:** Automatically detects nearby tokens acting as instructors or books in inventory that grant bonuses.

---

## 👥 Party Management & Time Distribution

While players manage their own projects, the Game Master can oversee the entire party and distribute training time through the **Group Learning** tab on any **Group/Party actor**.

- **Batch Distribution:** GMs can open the "Distribute Time" dialog to add (or deduct) time from multiple players simultaneously.
- **Party-Wide Overview:** See every character's active projects, current progress, and time bank status in a single unified view.
- **Manual Overrides:** GMs can manually adjust progress or targets for any character's project directly from this tab.

---

## 🎲 Training Mechanics

The engine supports three primary ways to resolve training, configurable per project or globally:

1.  **Direct Resolution:** Progress is gained at a 1:1 ratio with time spent.
2.  **Roll Resolution:** Standard d20-based checks using a configurable formula (e.g., `1d20 + @abilities.int.mod + @tutelage`).
3.  **Mathematical (Bulk) Resolution:** For large blocks of time, the engine can use a statistical formula to calculate the expected progress, maintaining mathematical fairness without rolling dozens of dice.

### Bulk vs. Separate Resolution

When spending a "Bulk" time unit (like a **Day** composed of multiple **Hours**), players can choose:

- **Bulk:** A single roll (or calculation) for the entire block.
- **Separate:** Multiple individual rolls summarized into a single clean chat message.

---

## 👨‍🏫 Tutelage & Guidance

Progress isn't just about time; it's about who is teaching you.

- **Instructors:** The module automatically scans configured "Teacher Compendiums" and world actors for eligible instructors.
- **Books:** Items in your inventory can provide "Tutelage" modifiers if they match configured criteria.
- **Cost Calculation:** Better teachers might yield more progress but cost more currency per hour.

---

## 🛠️ In-Game Configuration

### 1. Module Settings

Configure global rules, default DC, critical success behavior, and your custom "Time Units" (e.g., Hour = 1, Day = 10, Week = 70).

### 2. Project Setup (Item Sheet)

Any Item can be turned into a "Learning Project." Configure its target goal, requirements, and completion rewards.

- **Auto-grant Rewards:** Automatically grant an Item or Active Effect upon completion.
- **Follow-up Projects:** Link projects together to create training paths.

---

## 🛠️ Development & Workflow

For information on how to set up the development environment, code quality standards, and the release process, please see [DEVELOPMENT.md](./DEVELOPMENT.md).
