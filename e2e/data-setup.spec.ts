import { test, expect } from "@playwright/test";

test.describe("Data Setup", () => {
  test("setup test data", async ({ page }) => {
    await page.goto("/game");

    // Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    await page.evaluate(async () => {
      // 1. Create Compendiums if they don't exist
      const compendiums = [
        { label: "Test Learning Feats", name: "test-learning-feats", type: "Item" },
        { label: "Test Learning Books", name: "test-learning-books", type: "Item" },
        { label: "Test Teachers", name: "test-teachers", type: "Actor" },
      ];

      for (const c of compendiums) {
        let pack = (game as any).packs.get(`world.${c.name}`);
        if (!pack) {
          // @ts-ignore
          await CompendiumCollection.createCompendium({
            type: c.type,
            label: c.label,
            name: c.name,
            package: "world",
          });
          console.log(`Created compendium: ${c.label}`);
        }
      }

      // 2. Create Learning Feat
      const featPack = (game as any).packs.get("world.test-learning-feats");
      const existingFeats = await featPack.getDocuments();
      if (existingFeats.length === 0) {
        const featData = {
          name: "Test Learning Feat",
          type: "feat",
          img: "icons/skills/trades/smithing-anvil-silver.webp",
          system: {
            description: { value: "A test feat for learning." },
            type: { value: "feat" },
          },
          flags: {
            "thefehrs-learning-manager": {
              isLearningProject: true,
              projectData: {
                totalProgress: 100,
                requirements: [],
              },
            },
          },
        };
        // @ts-ignore
        await Item.create(featData, { pack: "world.test-learning-feats" });
        console.log("Created Test Learning Feat");
      }

      // 2.1 Create Invalid Learning Feat in Compendium
      const existingInvalid = existingFeats.find((i) => i.name === "Invalid Project");
      if (!existingInvalid) {
        const invalidData = {
          name: "Invalid Project",
          type: "feat",
          img: "icons/skills/trades/smithing-anvil-silver.webp",
          system: {
            description: { value: "" }, // Empty description
          },
          flags: {
            "thefehrs-learning-manager": {
              isLearningProject: true,
              projectData: {
                progress: 0,
                target: 0, // Invalid target
                requirements: [],
              },
            },
          },
        };
        // @ts-ignore
        await Item.create(invalidData, { pack: "world.test-learning-feats" });
        console.log("Created Invalid Project in compendium");
      }

      // 3. Create Learning Book
      const bookPack = (game as any).packs.get("world.test-learning-books");
      const existingBooks = await bookPack.getDocuments();
      if (existingBooks.length === 0) {
        const bookData = {
          name: "Test Learning Book",
          type: "loot",
          img: "icons/sundries/books/book-embossed-bound-gold.webp",
          system: {
            description: { value: "A test book for learning." },
          },
          flags: {
            "thefehrs-learning-manager": {
              learningBookBonus: {
                modifier: 2,
                categories: ["General"],
              },
            },
          },
        };
        // @ts-ignore
        await Item.create(bookData, { pack: "world.test-learning-books" });
        console.log("Created Test Learning Book");
      }

      // 4. Create Teacher
      const teacherPack = (game as any).packs.get("world.test-teachers");
      const existingTeachers = await teacherPack.getDocuments();
      if (existingTeachers.length === 0) {
        const teacherData = {
          name: "Test Teacher",
          type: "npc",
          img: "icons/citizens/scholars/scholar-monocle-reading.webp",
          system: {
            details: { biography: { value: "A test teacher." } },
          },
          flags: {
            "thefehrs-learning-manager": {
              teacherOfferings: [
                {
                  name: "Expert Tutelage",
                  modifier: 5,
                  costs: { gp: 10 },
                  categories: ["General"],
                },
              ],
            },
          },
        };
        // @ts-ignore
        await Actor.create(teacherData, { pack: "world.test-teachers" });
        console.log("Created Test Teacher");
      }

      // 5. Create PC Actors
      const pcNames = ["PC 1", "PC 2"];
      for (const name of pcNames) {
        let actor = (game as any).actors.getName(name);
        if (!actor) {
          const pcData = {
            name: name,
            type: "character",
            img: "icons/svg/mystery-man.svg",
          };
          // @ts-ignore
          await Actor.create(pcData);
          console.log(`Created PC: ${name}`);
        }
      }

      // 6. Add Incomplete Project to PC 1
      const pc1 = (game as any).actors.getName("PC 1");
      if (pc1) {
        const existingIncomplete = pc1.items.find((i) => i.name === "Incomplete Project");
        if (!existingIncomplete) {
          const incompleteData = {
            name: "Incomplete Project",
            type: "feat",
            img: "icons/skills/trades/smithing-anvil-silver.webp",
            flags: {
              "thefehrs-learning-manager": {
                isLearningProject: true,
                projectData: {
                  progress: 50,
                  target: 100,
                  requirements: [],
                },
              },
            },
          };
          await pc1.createEmbeddedDocuments("Item", [incompleteData]);
          console.log("Added Incomplete Project to PC 1");
        }
      }

      // 7. Create Group Actor
      let groupActor = (game as any).actors.find(
        (a) => a.name === "Test Group" && a.type === "group",
      );
      if (!groupActor) {
        const groupData = {
          name: "Test Group",
          type: "group",
          img: "icons/svg/group.svg",
        };
        // @ts-ignore
        await Actor.create(groupData);
        console.log("Created Test Group");
      }
    });

    // Simple verification
    const actorsCount = await page.evaluate(() => (game as any).actors.size);
    expect(actorsCount).toBeGreaterThanOrEqual(3); // PC 1, PC 2, Test Group
  });
});
