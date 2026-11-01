import { Box, Group, Text } from "@mantine/core";
import Link from "next/link";

export function AppHeader() {
  return (
    <Box component="header" className="app-header">
      <Group h={48} px="md" maw={1280} mx="auto" wrap="nowrap">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Group gap={8} wrap="nowrap">
            <Text c="#14211e" fw={600} size="sm">
              Inventory Manage
            </Text>
            <Text c="signal.8" size="sm" fw={500}>
              Backoffice
            </Text>
          </Group>
        </Link>
      </Group>
    </Box>
  );
}
