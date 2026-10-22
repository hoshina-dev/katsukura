import { Catalog } from "@/components/inventory-browser/CatalogResults";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Catalog
      title="Inventory"
      description="Browse products, parts, and available stock"
      params={await searchParams}
    />
  );
}
