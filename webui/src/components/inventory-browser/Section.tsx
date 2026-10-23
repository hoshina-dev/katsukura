"use client";

import {
  ActionIcon,
  Card,
  Collapse,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
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
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="sm">
          <Group gap="xs" align="flex-start" wrap="nowrap">
            {collapsible && (
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
              >
                {open ? (
                  <IconChevronDown size={18} />
                ) : (
                  <IconChevronRight size={18} />
                )}
              </ActionIcon>
            )}
            <div>
              <Title order={3} size="h4">
                {title}
              </Title>
              {description && (
                <Text size="sm" c="dimmed">
                  {description}
                </Text>
              )}
            </div>
          </Group>
          {actions && open && <Group gap="xs">{actions}</Group>}
        </Group>
        {collapsible ? <Collapse in={open}>{children}</Collapse> : children}
      </Stack>
    </Card>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}
