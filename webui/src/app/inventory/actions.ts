"use server";

import { type CatalogQuery, LIST_PAGE_SIZE } from "@/libs/inventory";
import { getCatalog } from "@/libs/papiRest";

// One more step of the scrolling catalog list view
export async function loadCatalogPage(
  query: CatalogQuery,
  availableOnly: boolean,
) {
  return getCatalog(query, availableOnly, LIST_PAGE_SIZE);
}
