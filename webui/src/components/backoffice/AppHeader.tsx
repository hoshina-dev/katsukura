"use client";

import { Box, Group, Text } from "@mantine/core";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    href: "/",
    label: "Parts",
    match: (path: string) =>
      path === "/" || (path.startsWith("/parts/") && path !== "/parts/new"),
  },
  {
    href: "/parts/new",
    label: "New part",
    match: (path: string) => path === "/parts/new",
  },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <Box component="header" className="app-header">
      <Group h={48} px="md" maw={1280} mx="auto" gap="lg" wrap="nowrap">
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
        <Group component="nav" gap={4} aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link"
              data-active={item.match(pathname) || undefined}
              aria-current={item.match(pathname) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </Group>
      </Group>
    </Box>
  );
}
