import { Badge, Text } from "@mantine/core";

export function StockStatus({ count }: { count: number }) {
  return count > 0 ? (
    <Text size="sm" fw={500} c="green.7">
      In stock
    </Text>
  ) : (
    <Text size="sm" fw={500} c="dimmed">
      Out of stock
    </Text>
  );
}

export function TypeLabel({ isProduct }: { isProduct: boolean }) {
  return (
    <Badge variant="light" color="gray" size="sm" radius="sm">
      {isProduct ? "Product" : "Part"}
    </Badge>
  );
}
