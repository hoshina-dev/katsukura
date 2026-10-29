import { Code, Text, Textarea } from "@mantine/core";
import type { ReactNode } from "react";

import type { SubmitResult } from "@/app/backoffice/actions";
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

// One line per problem, e.g. "category: got string, want null or array"
export function errorLines(result: SubmitResult) {
  const lines = Object.entries(result.fields ?? {}).map(([key, reason]) =>
    key ? `${key}: ${reason}` : reason,
  );
  return result.error ? [result.error, ...lines] : lines;
}

export function parseMetadata(text: string) {
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { metadata: value as Record<string, unknown> };
    }
    return { error: "metadata must be a JSON object" };
  } catch (error) {
    return { error: `invalid JSON: ${(error as Error).message}` };
  }
}

// Metadata as editable JSON, with the save errors listed underneath
export function MetadataInput({
  value,
  onChange,
  errors,
}: {
  value: string;
  onChange: (value: string) => void;
  errors: string[];
}) {
  return (
    <div>
      <Textarea
        label="Metadata"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        autosize
        minRows={6}
        styles={{
          input: { fontFamily: "var(--mantine-font-family-monospace)" },
        }}
      />
      {errors.map((line) => (
        <Text key={line} size="xs" c="red" mt={4}>
          *{line}
        </Text>
      ))}
    </div>
  );
}
