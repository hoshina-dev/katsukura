import { SkuDetail } from "@/components/backoffice/SkuDetail";
import type { SearchParams } from "@/libs/inventory";

export default async function PartPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { sku } = await params;
  return <SkuDetail sku={sku} params={await searchParams} />;
}
