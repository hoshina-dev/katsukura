import { SkuDetail } from "@/components/inventory-browser/SkuDetail";
import type { SearchParams } from "@/libs/inventory";

export default async function SkuPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { sku } = await params;
  return <SkuDetail sku={sku} params={await searchParams} />;
}
