import { Group, Text } from "@mantine/core";

import type { Stock } from "@/libs/inventory";

// Total items of a SKU, and how many are installed or free
export function StockCounts({ stock }: { stock: Stock }) {
  const counts = [
    ["Total", stock.total],
    ["In use", stock.in_use],
    ["Available", stock.available],
  ] as const;
  return (
    <Group gap="lg">
      {counts.map(([label, count]) => (
        <Text key={label} size="sm" c="dimmed">
          {label}{" "}
          <Text span fw={600} c="var(--mantine-color-text)">
            {count}
          </Text>
        </Text>
      ))}
    </Group>
  );
}
