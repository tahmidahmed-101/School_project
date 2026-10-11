import type { CategoryInfo } from "@/lib/types";

export interface CategoryNode {
  category: CategoryInfo;
  /** 0 for a main category, 1 for its subcategories, and so on. */
  depth: number;
  /** The category directly above; absent on a main category. */
  parent?: CategoryInfo;
}

/**
 * The list in menu order: every main category followed by its subcategories. Siblings keep the order they came in.
 * A subcategory whose parent is not in the list (the other shop, or inactive) is shown as a main category.
 */
export function categoryTree(categories: CategoryInfo[]): CategoryNode[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const parentOf = (category: CategoryInfo) =>
    category.parentId && category.parentId !== category.id ? byId.get(category.parentId) : undefined;

  const nodes: CategoryNode[] = [];
  const seen = new Set<string>();
  const add = (category: CategoryInfo, depth: number, parent?: CategoryInfo) => {
    if (seen.has(category.id)) return;
    seen.add(category.id);
    nodes.push({ category, depth, ...(parent && { parent }) });
    for (const child of categories) if (parentOf(child) === category) add(child, depth + 1, category);
  };

  for (const category of categories) if (!parentOf(category)) add(category, 0);
  // Only reachable when parents point at each other; nothing may drop out of the menu.
  for (const category of categories) add(category, 0);
  return nodes;
}

export interface CategoryGroup {
  main: CategoryInfo;
  /** Everything under the main category, in menu order; `depth` starts at 1. */
  subs: CategoryNode[];
  /** Products in the main category and in all of its subcategories. */
  itemCount: number;
}

/** The list as main categories, each carrying its subcategories. */
export function categoryGroups(categories: CategoryInfo[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const node of categoryTree(categories)) {
    const group = node.depth === 0 ? undefined : groups.at(-1);
    if (!group) groups.push({ main: node.category, subs: [], itemCount: node.category.itemCount });
    else {
      group.subs.push(node);
      group.itemCount += node.category.itemCount;
    }
  }
  return groups;
}

/** Lower-cased ids of a category and everything under it: what "shop this category" covers. */
export function categoryFamily(categories: CategoryInfo[], id: string): Set<string> {
  const family = new Set([id.toLowerCase()]);
  let inside = false;
  let rootDepth = 0;
  for (const { category, depth } of categoryTree(categories)) {
    if (category.id.toLowerCase() === id.toLowerCase()) {
      inside = true;
      rootDepth = depth;
    } else if (inside && depth > rootDepth) family.add(category.id.toLowerCase());
    else inside = false;
  }
  return family;
}
