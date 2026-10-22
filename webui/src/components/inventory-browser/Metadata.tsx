import { Code, Text } from "@mantine/core";
import type { ReactNode } from "react";

import type { Metadata } from "@/libs/inventory";

import { EmptyNote, Section } from "./Section";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </div>
  );
}

export function MetadataSection({ metadata }: { metadata: Metadata }) {
  return (
    <Section title="Metadata">
      {Object.keys(metadata).length === 0 ? (
        <EmptyNote>No metadata.</EmptyNote>
      ) : (
        <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(metadata, null, 2)}
        </Code>
      )}
    </Section>
  );
}
