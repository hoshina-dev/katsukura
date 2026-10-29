"use client";

import { ActionIcon, Box, Collapse, Group, Text, Title } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

interface SectionProps {
  title: string;
  description?: string;
  // Controls shown on the right of the title
  actions?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}

export function Section({
  title,
  description,
  actions,
  collapsible,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <Box component="section" className="panel">
      <Group
        className={open ? "panel-header" : undefined}
        justify="space-between"
        gap="sm"
        px="md"
        py={10}
        mih={52}
      >
        <Group gap={6} wrap="nowrap">
          {collapsible && (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            >
              {open ? (
                <IconChevronDown size={16} />
              ) : (
                <IconChevronRight size={16} />
              )}
            </ActionIcon>
          )}
          <Title order={2}>{title}</Title>
          {description && (
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {description}
            </Text>
          )}
        </Group>
        {actions && open && <Group gap="xs">{actions}</Group>}
      </Group>
      {collapsible ? (
        <Collapse in={open}>
          <Box p="md">{children}</Box>
        </Collapse>
      ) : (
        <Box p="md">{children}</Box>
      )}
    </Box>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}
