import { Box, Group, Text } from "@mantine/core";

import type { Stock } from "@/libs/inventory";

// Installed share of stock in the primary colour, free share tinted
export function StockMeter({
  stock,
  w = 96,
}: {
  stock: Stock;
  w?: number | string;
}) {
  const inUse = stock.total > 0 ? (stock.in_use / stock.total) * 100 : 0;
  return (
    <Box
      w={w}
      h={6}
      aria-hidden
      style={{
        borderRadius: 3,
        overflow: "hidden",
        background:
          stock.total > 0
            ? "var(--app-meter-free)"
            : "var(--mantine-color-gray-2)",
      }}
    >
      <Box h="100%" w={`${inUse}%`} bg="signal.8" />
    </Box>
  );
}

// Total items of a SKU, and how many are installed or free
export function StockCounts({ stock }: { stock: Stock }) {
  const counts = [
    ["Total", stock.total],
    ["In use", stock.in_use],
    ["Available", stock.available],
  ] as const;
  return (
    <Group gap="lg" className="tabular">
      {counts.map(([label, count]) => (
        <Text key={label} size="sm" c="dimmed">
          {label}{" "}
          <Text span fw={600} c="var(--mantine-color-text)">
            {count}
          </Text>
        </Text>
      ))}
      <StockMeter stock={stock} w={120} />
    </Group>
  );
}
