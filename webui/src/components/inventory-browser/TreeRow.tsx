"use client";

import { ActionIcon, Box, Collapse, Group } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

interface TreeRowProps {
  depth: number;
  label: ReactNode;
  nested?: ReactNode;
  defaultOpen?: boolean;
}

export function TreeRow({ depth, label, nested, defaultOpen }: TreeRowProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <>
      <Group
        gap="xs"
        wrap="nowrap"
        py={8}
        pl={depth * 24}
        style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}
      >
        {nested ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? (
              <IconChevronDown size={16} />
            ) : (
              <IconChevronRight size={16} />
            )}
          </ActionIcon>
        ) : (
          <Box w={22} style={{ flexShrink: 0 }} />
        )}
        {label}
      </Group>
      {nested && <Collapse in={open}>{nested}</Collapse>}
    </>
  );
}
