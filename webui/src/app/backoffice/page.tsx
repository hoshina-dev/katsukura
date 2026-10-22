import { Catalog } from "@/components/inventory-browser/CatalogResults";

export default async function BackofficePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Catalog
      title="Inventory management"
      description="Manage products, parts, and stock"
      params={await searchParams}
      addHref="/backoffice/add"
    />
  );
}
