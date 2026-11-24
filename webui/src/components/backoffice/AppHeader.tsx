import { Box, Group, Text } from "@mantine/core";
import { Link, usePathname } from "@/libs/nav";

export function AppHeader() {
  const pathname = usePathname();
  const bomIndex = pathname === "/bom" || pathname === "/bom/";

  return (
    <Box component="header" className="app-header">
      <Group h={48} px="md" maw={1280} mx="auto" wrap="nowrap">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Group gap={8} wrap="nowrap">
            <Text c="#14211e" fw={600} size="sm">
              Inventory Manage
            </Text>
            <Text className="app-header-context" c="signal.8" size="sm" fw={500}>
              Backoffice
            </Text>
          </Group>
        </Link>
        <Group component="nav" aria-label="Backoffice" gap={4} wrap="nowrap">
          <Link
            className="app-nav-link"
            href="/"
            aria-current={
              pathname === "/"
                ? "page"
                : pathname.startsWith("/units/")
                  ? "location"
                  : undefined
            }
          >
            Units
          </Link>
          <Link
            className="app-nav-link"
            href="/bom"
            aria-current={
              bomIndex
                ? "page"
                : pathname.startsWith("/bom/")
                  ? "location"
                  : undefined
            }
          >
            BOM
          </Link>
        </Group>
      </Group>
    </Box>
  );
}
