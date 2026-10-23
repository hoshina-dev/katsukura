import { ItemDetail } from "@/components/inventory-browser/ItemDetail";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ sku: string; itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemDetail itemId={itemId} />;
}
