import { test, expect } from "./fixtures";

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
          await foundry.documents.collections.CompendiumCollection.createCompendium({
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
            activities: {},
          },
          flags: {
            "thefehrs-learning-manager": {
              isLearningProject: true,
              projectData: {
                target: 100,
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
            type: { value: "feat" },
            activities: {},
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

      // 3. Create Learning Books
      const bookPack = (game as any).packs.get("world.test-learning-books");
      const existingBooks = await bookPack.getDocuments();
      if (existingBooks.length === 0) {
        const booksData = [
          {
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
          },
          {
            name: "Manual of Arms",
            type: "loot",
            img: "icons/sundries/books/book-warfare-brown.webp",
            system: {
              description: { value: "A manual on combat techniques." },
            },
            flags: {
              "thefehrs-learning-manager": {
                learningBookBonus: {
                  modifier: 1,
                  categories: ["Combat"],
                },
              },
            },
          },
        ];
        // @ts-ignore
        await Item.create(booksData, { pack: "world.test-learning-books" });
        console.log("Created Test Learning Books");
      }

      // 4. Create Teachers
      const teacherPack = (game as any).packs.get("world.test-teachers");
      const existingTeachers = await teacherPack.getDocuments();
      if (existingTeachers.length === 0) {
        const teachersData = [
          {
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
                    costs: { hour: 1000 }, // 10 GP
                    categories: ["General"],
                  },
                ],
              },
            },
          },
          {
            name: "Combat Master",
            type: "npc",
            img: "icons/citizens/knights/knight-armor-plate-helmet.webp",
            system: {
              details: { biography: { value: "A master of combat." } },
            },
            flags: {
              "thefehrs-learning-manager": {
                teacherOfferings: [
                  {
                    name: "Combat Training",
                    modifier: 5,
                    costs: { hour: 2000 }, // 20 GP
                    categories: ["Combat"],
                  },
                ],
              },
            },
          },
          {
            name: "Scholar",
            type: "npc",
            img: "icons/citizens/scholars/scholar-reading-scroll.webp",
            system: {
              details: { biography: { value: "A wise scholar." } },
            },
            flags: {
              "thefehrs-learning-manager": {
                teacherOfferings: [
                  {
                    name: "History Lessons",
                    modifier: 2,
                    costs: { hour: 500 }, // 5 GP
                    categories: ["History"],
                  },
                ],
              },
            },
          },
        ];
        // @ts-ignore
        await Actor.create(teachersData, { pack: "world.test-teachers" });
        console.log("Created Test Teachers");
      }

      // 5. Create PC Actors
      const pcNames = ["PC 1", "PC 2", "PC 3", "PC 4"];
      for (const name of pcNames) {
        let actor = (game as any).actors.getName(name);
        if (!actor) {
          const pcData = {
            name: name,
            type: "character",
            img: "icons/svg/mystery-man.svg",
            system: {
              currency: {
                gp: 100,
              },
            },
            flags: {
              core: {
                sheetClass: "dnd5e.Tidy5eCharacterSheet",
              },
            },
          };
          // @ts-ignore
          await Actor.create(pcData);
          console.log(`Created PC: ${name}`);
        }
      }

      // 6. Add Projects to PCs
      const pc1 = (game as any).actors.getName("PC 1");
      if (pc1) {
        // Incomplete Project
        const existingIncomplete = pc1.items.find((i) => i.name === "Incomplete Project");
        if (!existingIncomplete) {
          const incompleteData = {
            name: "Incomplete Project",
            type: "feat",
            img: "icons/skills/trades/smithing-anvil-silver.webp",
            system: {
              type: { value: "feat" },
              activities: {},
            },
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

        // Combat Training Project for Step 2
        const combatProjectName = "Combat Training";
        const existingCombat = pc1.items.find((i) => i.name === combatProjectName);
        if (!existingCombat) {
          const projectData = {
            name: combatProjectName,
            type: "feat",
            img: "icons/skills/melee/strike-greataxe-orange.webp",
            system: {
              type: { value: "learning-project" },
              description: { value: "<p>Learning combat techniques.</p>" },
              activities: {},
            },
            flags: {
              "thefehrs-learning-manager": {
                isLearningProject: true,
                projectData: {
                  progress: 0,
                  target: 100,
                  stashedName: combatProjectName,
                  stashedType: "feat",
                  stashedSystem: {
                    type: { value: "feat" },
                    description: { value: "Learned combat techniques." },
                  },
                  requirements: [],
                  categories: ["Combat"],
                },
              },
              "tidy5e-sheet": {
                section: "In-Progress Learning",
              },
            },
          };
          await pc1.createEmbeddedDocuments("Item", [projectData]);
          console.log("Added Combat Training Project to PC 1");
        }

        // Project near completion for Test 1
        const completionProjectName = "Test Learning Feat";
        const existingCompletion = pc1.items.find((i) => i.name.startsWith(completionProjectName));
        if (!existingCompletion) {
          const projectData = {
            name: `${completionProjectName} (95/100)`,
            type: "feat",
            img: "icons/skills/trades/smithing-anvil-silver.webp",
            system: {
              type: { value: "learning-project" },
              description: { value: "<p>A test feat for learning.</p>" },
              activities: {},
            },
            flags: {
              "thefehrs-learning-manager": {
                isLearningProject: true,
                projectData: {
                  progress: 95,
                  target: 100,
                  stashedName: completionProjectName,
                  stashedType: "weapon",
                  stashedEffects: [
                    {
                      name: "AC Bonus",
                      img: "icons/skills/trades/smithing-anvil-silver.webp",
                      changes: [
                        {
                          key: "system.attributes.ac.bonus",
                          value: "1",
                          mode: 2,
                        },
                      ],
                      disabled: false,
                    },
                  ],
                  stashedSystem: {
                    type: { value: "feat" },
                    description: { value: "A test feat for learning." },
                  },
                  requirements: [],
                  categories: ["Combat"],
                },
              },
            },
          };
          await pc1.createEmbeddedDocuments("Item", [projectData]);
          console.log("Added Completion Project to PC 1");
        }

        // Manual of Arms in inventory
        const existingManual = pc1.items.find((i) => i.name === "Manual of Arms");
        if (!existingManual) {
          const bookPack = (game as any).packs.get("world.test-learning-books");
          const book = (await bookPack.getDocuments()).find((i) => i.name === "Manual of Arms");
          if (book) {
            await pc1.createEmbeddedDocuments("Item", [book.toObject()]);
            console.log("Added Manual of Arms to PC 1");
          }
        }
      }

      const pc2 = (game as any).actors.getName("PC 2");
      if (pc2) {
        const projectName = "Bulk Training Project";
        const existing = pc2.items.find((i) => i.name === projectName);
        if (!existing) {
          const projectData = {
            name: projectName,
            type: "feat",
            img: "icons/skills/trades/smithing-anvil-silver.webp",
            system: {
              type: { value: "feat" },
              activities: {},
            },
            flags: {
              "thefehrs-learning-manager": {
                isLearningProject: true,
                projectData: {
                  progress: 0,
                  target: 100,
                  requirements: [],
                },
              },
            },
          };
          await pc2.createEmbeddedDocuments("Item", [projectData]);
          console.log("Added Bulk Training Project to PC 2");
        }
      }

      const pc3 = (game as any).actors.getName("PC 3");
      if (pc3) {
        const projectName = "Time Bank Project";
        const existing = pc3.items.find((i) => i.name === projectName);
        if (!existing) {
          const projectData = {
            name: projectName,
            type: "feat",
            img: "icons/skills/trades/smithing-anvil-silver.webp",
            system: {
              type: { value: "feat" },
              activities: {},
            },
            flags: {
              "thefehrs-learning-manager": {
                isLearningProject: true,
                projectData: {
                  progress: 0,
                  target: 100,
                  requirements: [],
                },
              },
            },
          };
          await pc3.createEmbeddedDocuments("Item", [projectData]);
          console.log("Added Time Bank Project to PC 3");
        }
      }

      const pc4 = (game as any).actors.getName("PC 4");
      if (pc4) {
        const projectName = "GM Override Project";
        const existing = pc4.items.find((i) => i.name === projectName);
        if (!existing) {
          const projectData = {
            name: projectName,
            type: "feat",
            img: "icons/skills/trades/smithing-anvil-silver.webp",
            system: {
              type: { value: "learning-project" },
              activities: {},
            },
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
          await pc4.createEmbeddedDocuments("Item", [projectData]);
          console.log("Added GM Override Project to PC 4");
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
          flags: {
            core: {
              sheetClass: "dnd5e.Tidy5eGroupSheetQuadrone",
            },
          },
        };
        // @ts-ignore
        groupActor = await Actor.create(groupData);
        console.log("Created Test Group");
      }

      // Add all PCs to group members if not already there
      const actorsToGroup = ["PC 1", "PC 2", "PC 3", "PC 4"];

      const addMember = async (group, actor) => {
        if (!actor) return;
        const memberList = group.system.members || [];
        const memberIds = new Set(
          memberList.map((m: any) => m.actorId || m.id || (m.actor && m.actor.id)),
        );
        if (memberIds.has(actor.id)) return;

        console.log(`Adding ${actor.name} to Test Group...`);
        if (typeof group.system.addMember === "function") {
          await group.system.addMember(actor);
        } else {
          await group.update({
            "system.members": [...memberList, { actorId: actor.id }],
          });
        }
      };

      if (groupActor) {
        for (const name of actorsToGroup) {
          const actor = (game as any).actors.getName(name);
          await addMember(groupActor, actor);
        }
      }

      // 8. Configure Module Settings
      const moduleId = "thefehrs-learning-manager";
      await (game as any).settings.set(moduleId, "allowedCompendiums", [
        "world.test-learning-feats",
      ]);
      await (game as any).settings.set(moduleId, "teacherCompendiums", ["world.test-teachers"]);
      await (game as any).settings.set(moduleId, "bookCompendiums", ["world.test-learning-books"]);

      // Set time units including "Work Week"
      await (game as any).settings.set(moduleId, "timeUnits", [
        { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
        { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
        { id: "workweek", name: "Work Week", short: "ww", isBulk: true, ratio: 40 },
        { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
      ]);

      console.log("Configured module settings");

      // Sync activities for all created projects
      // @ts-ignore
      await game.modules.get(moduleId).api.ProjectEngine.syncAllProjectActivities();
      console.log("Synced all project activities");
    });

    // Simple verification
    const actorsCount = await page.evaluate(() => (game as any).actors.size);
    expect(actorsCount).toBeGreaterThanOrEqual(5); // PC 1, 2, 3, 4, Test Group
  });
});
