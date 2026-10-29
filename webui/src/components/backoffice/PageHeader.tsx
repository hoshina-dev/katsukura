"use client";

import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  // Ancestor pages, root first; the current page is the title
  trail?: { href: string; label: string }[];
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, trail, meta, actions }: PageHeaderProps) {
  return (
    <Stack gap={6}>
      {trail && (
        <Breadcrumbs separatorMargin={6}>
          {trail.map((crumb) => (
            <Anchor
              key={crumb.href}
              component={Link}
              href={crumb.href}
              size="sm"
            >
              {crumb.label}
            </Anchor>
          ))}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-end" gap="md">
        <Stack gap={4} miw={0}>
          <Title order={1}>{title}</Title>
          {meta && (
            <Group gap="md" c="dimmed">
              {meta}
            </Group>
          )}
        </Stack>
        {actions && <Group gap="xs">{actions}</Group>}
      </Group>
    </Stack>
  );
}

// A part's or item's identifier, set as a small tag
export function IdTag({ children }: { children: ReactNode }) {
  return (
    <Text
      component="span"
      size="xs"
      ff="monospace"
      c="gray.7"
      px={6}
      py={1}
      style={{
        border: "1px solid var(--app-line)",
        borderRadius: 3,
        background: "#fafaf8",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Text>
  );
}
