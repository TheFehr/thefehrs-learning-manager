import { Settings } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import { projectData } from "@/logic/project-item.js";
import { getUI, getGame } from "@/core/foundry.js";
import type { Item5e, ProjectFlagData } from "@/types.js";

export interface ProjectTreeNode {
  uuid: string;
  name: string;
  img: string;
  item: Item5e;
  children: ProjectTreeNode[];
  parentId: string | null;
  depth: number;
  expanded?: boolean;
}

export class TreeLogic {
  /**
   * Fetches projects from all allowed compendiums and builds a hierarchical forest.
   */
  static async buildProjectTree(
    showAll = false,
    pinnedUuids: string[] = [],
  ): Promise<ProjectTreeNode[]> {
    const allowedCompendiums = Settings.get("allowedCompendiums");
    const allItems: Item5e[] = [];

    // 1. Fetch all items from allowed compendiums
    for (const packId of allowedCompendiums) {
      const pack = getGame().packs?.get(packId);
      if (!pack) continue;

      const documents = await pack.getDocuments();
      allItems.push(...(documents as Item5e[]));
    }

    const itemMap = new Map<string, Item5e>();
    for (const item of allItems) {
      itemMap.set(item.uuid, item);
    }

    // 2. Identify all child UUIDs to find Roots
    const childrenUuids = new Set<string>();
    for (const item of allItems) {
      const data = projectData(item);
      const childUuids = this._getChildUuids(data);
      for (const id of childUuids) {
        childrenUuids.add(id);
      }
    }

    // 3. Roots are items that aren't anyone's follow-up
    const roots = allItems.filter((item) => {
      // Pinned items are ALWAYS allowed to be roots (helps with UX/discovery)
      if (pinnedUuids.includes(item.uuid)) return true;

      const isChild = childrenUuids.has(item.uuid);
      if (isChild) return false;

      if (showAll) return true;

      const data = projectData(item);
      // A visible root is:
      // 1. Explicitly marked as a Learning Project
      // 2. OR is a parent (has children/follow-ups)
      // 3. OR has projectData defined (Overview logic)
      const isProject = !!item.getFlag(Settings.ID, "isLearningProject") || !!data;
      const hasChildren = this._getChildUuids(data).size > 0;

      return isProject || hasChildren;
    });

    // 4. Build trees recursively
    const forest: ProjectTreeNode[] = [];
    const visited = new Set<string>(); // Global to ensure uniqueness in the whole UI

    for (const root of roots) {
      const node = await this._buildNode(root, itemMap, visited, new Set(), null, 0);
      if (node) {
        forest.push(node);
      }
    }

    return forest;
  }

  /**
   * Removes a specific child link from a parent.
   */
  static async orphanProject(parentItem: Item5e, childUuid: string): Promise<boolean> {
    try {
      const packId = (parentItem as unknown as { pack?: string }).pack;
      const pack = packId ? getGame().packs?.get(packId) : null;
      if (pack?.locked) {
        getUI()?.notifications?.error(
          `Compendium "${pack.metadata.label}" is locked! Unlock it to modify projects.`,
        );
        return false;
      }

      const data = projectData(parentItem);

      if (data?.followUpProjectId === childUuid) {
        await parentItem.update({ [`flags.${Settings.ID}.projectData.followUpProjectId`]: "" });
      }

      return true;
    } catch (err) {
      Logger.error("Failed to orphan project:", true, err);
      return false;
    }
  }

  /**
   * Establishes a follow-up link between a parent and a child.
   */
  static async reparentProject(parentItem: Item5e, childUuid: string): Promise<boolean> {
    try {
      const packId = (parentItem as unknown as { pack?: string }).pack;
      const pack = packId ? getGame().packs?.get(packId) : null;
      if (pack?.locked) {
        getUI()?.notifications?.error(
          `Compendium "${pack.metadata.label}" is locked! Unlock it to modify projects.`,
        );
        return false;
      }

      // Prevent self-parenting
      if (parentItem.uuid === childUuid) {
        getUI()?.notifications?.warn("A project cannot be its own follow-up!");
        return false;
      }

      // Prevent circular follow-up chains (walking up from child)
      let currentUuid: string | null = childUuid;
      while (currentUuid) {
        if (currentUuid === parentItem.uuid) {
          getUI()?.notifications?.warn("This change would create a circular follow-up chain!");
          return false;
        }

        const currentItem = (await fromUuid(currentUuid)) as Item5e | null;
        const data = currentItem ? projectData(currentItem) : null;
        currentUuid = data?.followUpProjectId || null;
      }

      // Prevent redundant descendant links (walking down from parent)
      let parentChainUuid: string | null = projectData(parentItem)?.followUpProjectId || null;
      while (parentChainUuid) {
        if (parentChainUuid === childUuid) {
          getUI()?.notifications?.warn(
            "This project is already a descendant of the selected parent!",
          );
          return false;
        }
        const item = (await fromUuid(parentChainUuid)) as Item5e | null;
        parentChainUuid = item ? projectData(item)?.followUpProjectId || null : null;
      }

      await parentItem.update({
        [`flags.${Settings.ID}.projectData.followUpProjectId`]: childUuid,
      });

      return true;
    } catch (err) {
      Logger.error("Failed to reparent project:", true, err);
      return false;
    }
  }

  private static async _buildNode(
    item: Item5e,
    itemMap: Map<string, Item5e>,
    visited: Set<string>,
    stack: Set<string>,
    parentId: string | null,
    depth: number,
  ): Promise<ProjectTreeNode | null> {
    // 1. Check for True Circularity (A -> B -> A)
    if (stack.has(item.uuid)) {
      Logger.error(
        `Circular dependency detected at project: ${item.name} (${item.uuid}). Stopping recursion.`,
      );
      return null;
    }

    // 2. Check for Duplicates (Item already rendered in another branch or root)
    if (visited.has(item.uuid)) {
      return null;
    }

    visited.add(item.uuid);
    stack.add(item.uuid);

    const children: ProjectTreeNode[] = [];
    const data = projectData(item);
    const childUuids = this._getChildUuids(data);

    for (const childUuid of childUuids) {
      // Try to get from map first, otherwise dynamically fetch
      let childItem = itemMap.get(childUuid);
      if (!childItem) {
        try {
          // @ts-ignore
          childItem = await fromUuid(childUuid);
          if (childItem) itemMap.set(childUuid, childItem);
        } catch (e) {
          Logger.debug(`Failed to fetch child item ${childUuid} for parent ${item.uuid}`, e);
        }
      }

      if (childItem) {
        const childStack = new Set(stack); // Clone stack for child branch
        const childNode = await this._buildNode(
          childItem,
          itemMap,
          visited,
          childStack,
          item.uuid,
          depth + 1,
        );
        if (childNode) children.push(childNode);
      }
    }

    return {
      uuid: item.uuid,
      name: item.name ?? "Unknown",
      img: item.img ?? "icons/svg/item-bag.svg",
      item,
      children,
      parentId,
      depth,
    };
  }

  private static _getChildUuids(data: ProjectFlagData | null | undefined): Set<string> {
    const ids = new Set<string>();
    if (data?.followUpProjectId) ids.add(data.followUpProjectId);
    return ids;
  }
}
