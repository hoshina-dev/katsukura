import { Catalog } from "@/components/backoffice/CatalogResults";

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Catalog params={await searchParams} />;
}
