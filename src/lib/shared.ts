// Client-safe helpers (no Node imports) shared by pages and server code.

import type { RepoFlavor } from "./types";

/** Flavor-aware vocabulary so the same structure serves courses and catalogs. */
export function flavorLabels(flavor: RepoFlavor) {
  switch (flavor) {
    case "menu":
      return { unit: "Menu section", lesson: "Dish", play: "Present", repo: "Menu" };
    case "catalog":
      return { unit: "Category", lesson: "Item", play: "Present", repo: "Catalog" };
    case "portfolio":
      return { unit: "Collection", lesson: "Project", play: "Present", repo: "Portfolio" };
    default:
      return { unit: "Unit", lesson: "Lesson", play: "Study", repo: "Course" };
  }
}

/** Browser-safe unique id for client-created cards. */
export function clientId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}
