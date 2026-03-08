# The Fehrs Learning Manager

A custom Downtime Engine and Learning Manager for Foundry VTT. This module integrates seamlessly into the **Tidy5e** character and party sheets, providing a robust, highly configurable system for tracking downtime learning, training projects, and tutelage.

Whether your players are learning a new language, training a feat, or mastering a tool proficiency, this module handles the time management, cost calculation, and progress tracking automatically.

---

## 🌟 Key Features

### For the Game Master

- **Data-Driven & System Agnostic:** The core code is completely rule-agnostic. All scaling matrices, learning rates, and tutelage modifiers are driven by configurable JSON data, allowing you to adapt the module to your specific campaign mechanics without touching the underlying code.
- **Global Time Bank Distribution:** A dedicated GM interface on the Party Sheet to distribute configurable blocks of time (e.g., Hours, Days, Weeks) to specific characters or the entire party simultaneously.
- **Custom Tutelage Matrix:** Define exactly how effective different teachers are (e.g., _Self-Taught_, _Amateur_, _Professional_). Set specific gold/silver/copper costs and progress yields based on the tier of the teacher and the time unit spent.
- **Project Library:** Pre-define standard projects (e.g., "Learn Elvish", "Blacksmithing Training") with specific target goals. Attach Item UUIDs to auto-grant the reward directly to the player's inventory upon completion.

### For the Players

- **Native Tidy5e Integration:** Adds a beautiful, dedicated "Learning" tab directly into the modern Tidy5e Character sheet.
- **Automated Progression:** Players select their active project, choose their teacher tier, and click the time they want to spend. The engine automatically deducts the exact currency and applies the calculated progress.
- **Clear UI:** Visual progress bars and time bank readouts let players know exactly how much downtime they have left and how close they are to their goals.

---

## 🛠️ In-Game Configuration

The module features a comprehensive Settings UI where GMs can build out their learning matrix.

**Quick Start via JSON Import:**
Instead of typing every value manually, you can construct your entire matrix (Time Units, Guidance Tiers, Global Rules, and Projects) in a single JSON file. Open the **Downtime Engine Config** panel in your game settings and click **Import JSON** to instantly populate your world's ruleset.

---

## 💻 Development Setup

This project utilizes `vite` and `vite-plugin-fvtt` for lightning-fast Hot Module Replacement (HMR). When configured correctly, saving a file instantly updates the Foundry VTT UI without requiring a page refresh.

### 1. Prerequisites

Ensure you have Node.js installed. Clone the repository and install the dependencies:

```bash
npm install
```

### 2. Code Quality & Hooks

This project uses **Husky** and **lint-staged** to maintain code quality.

- **Pre-commit Hook:** A Git `pre-commit` hook is automatically configured to run whenever you commit changes.
- **Automatic Formatting:** On every commit, `lint-staged` runs `npm run fmt` (powered by `oxfmt`) on your staged files. This ensures all code adheres to the project's formatting standards before it enters the repository.

To manually trigger formatting, you can run:

```bash
npm run fmt
```
