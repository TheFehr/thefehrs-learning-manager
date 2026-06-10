import { MODULE_ID } from "@/global.js";
import { Settings } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import { getGame } from "@/core/foundry.js";
import type { Item5e, Actor5e } from "@/types.js";

export interface PackIndexEntry {
  _id: string;
  name: string;
  packId: string;
  uuid: string;
  learningModeEnabled: boolean;
}

export async function buildPackIndex(
  packIds: string[],
  docType: "Item" | "Actor",
): Promise<PackIndexEntry[]> {
  const entries: PackIndexEntry[] = [];
  const flagPath = `flags.${MODULE_ID}.learningModeEnabled`;

  for (const packId of packIds) {
    const pack = getGame().packs?.get(packId);
    if (!pack) {
      Logger.warn(`Mass Edit | Pack "${packId}" not found.`);
      continue;
    }
    if (pack.metadata.type !== docType && (pack as any).documentName !== docType) continue;

    try {
      const index = (await (pack as any).getIndex({
        fields: [flagPath],
      })) as unknown as Array<{ _id: string; name: string; [key: string]: unknown }>;

      for (const entry of index) {
        const flagData = foundry.utils.getProperty(entry, flagPath);
        entries.push({
          _id: entry._id,
          name: entry.name || "Unknown",
          packId,
          uuid: `Compendium.${packId}.${docType}.${entry._id}`,
          learningModeEnabled: !!flagData,
        });
      }
    } catch (err) {
      Logger.warn(`Mass Edit | Failed to index pack "${packId}":`, false, err);
    }
  }

  return entries;
}

export function buildWorldActorIndex(): PackIndexEntry[] {
  const actors = getGame().actors?.contents || [];
  return actors.map((a) => ({
    _id: a.id!,
    name: a.name || "Unknown",
    packId: "",
    uuid: a.uuid,
    learningModeEnabled: !!a.getFlag(MODULE_ID, "learningModeEnabled"),
  }));
}

export async function loadFullDocument<T>(entry: PackIndexEntry): Promise<T | null> {
  if (!entry.packId) {
    return (getGame().actors?.get(entry._id) as unknown as T) ?? null;
  }
  const pack = getGame().packs?.get(entry.packId);
  if (!pack) return null;
  try {
    return ((await (pack as any).getDocument(entry._id)) as T) ?? null;
  } catch (err) {
    Logger.warn(`Mass Edit | Failed to load "${entry._id}" from "${entry.packId}":`, false, err);
    return null;
  }
}

export async function loadConfiguredDocuments<T>(entries: PackIndexEntry[]): Promise<T[]> {
  const configured = entries.filter((e) => e.learningModeEnabled);
  const results = await Promise.allSettled(configured.map((e) => loadFullDocument<T>(e)));
  const docs: T[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      docs.push(result.value as T);
    }
  }
  return docs;
}

export async function activateDocument(entry: PackIndexEntry): Promise<Item5e | Actor5e | null> {
  const doc = await loadFullDocument<Item5e | Actor5e>(entry);
  if (!doc) return null;
  try {
    await (doc as any).setFlag(MODULE_ID, "learningModeEnabled", true);
    return doc;
  } catch (err) {
    Logger.error(`Mass Edit | Failed to activate "${entry.name}":`, true, err);
    return null;
  }
}

export function getAvailableDestinations(packIds: string[]): Array<{ id: string; label: string }> {
  const destinations: Array<{ id: string; label: string }> = [];
  for (const packId of packIds) {
    const pack = getGame().packs?.get(packId);
    if (pack && !(pack as any).locked) {
      destinations.push({ id: packId, label: (pack as any).metadata.label });
    }
  }
  destinations.push({ id: "", label: "World" });
  return destinations;
}

export async function createAndActivateDocument(
  docType: "Item" | "Actor",
  name: string,
  itemType: string | undefined,
  packId: string,
): Promise<Item5e | Actor5e | null> {
  try {
    const data: Record<string, unknown> = { name };
    if (itemType) data.type = itemType;

    const options: Record<string, unknown> = {};
    if (packId) options.pack = packId;

    const DocClass = (CONFIG as any)[docType].documentClass as any;
    const doc = (await DocClass.create(data, options)) as Item5e | Actor5e;
    if (!doc) return null;

    await (doc as any).setFlag(MODULE_ID, "learningModeEnabled", true);
    return doc;
  } catch (err) {
    Logger.error(`Mass Edit | Failed to create "${name}":`, true, err);
    return null;
  }
}

export async function loadProjectsIndex(): Promise<PackIndexEntry[]> {
  const packIds = Settings.get("allowedCompendiums");
  return buildPackIndex(packIds, "Item");
}

export async function loadTeachersIndex(): Promise<PackIndexEntry[]> {
  const packIds = Settings.get("teacherCompendiums");
  const entries = await buildPackIndex(packIds, "Actor");
  if (Settings.get("scanWorldActors")) {
    entries.push(...buildWorldActorIndex());
  }
  return entries;
}

export async function loadBooksIndex(): Promise<PackIndexEntry[]> {
  const packIds = Settings.get("bookCompendiums");
  return buildPackIndex(packIds, "Item");
}
