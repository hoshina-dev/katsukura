import { Text, Textarea } from "@mantine/core";

import type { SubmitResult } from "@/app/actions";

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
        maxRows={24}
        spellCheck={false}
        styles={{
          input: {
            fontFamily: "var(--mantine-font-family-monospace)",
            fontSize: "var(--mantine-font-size-xs)",
          },
        }}
      />
      {errors.map((line) => (
        <Text key={line} size="xs" c="red.8" mt={4}>
          {line}
        </Text>
      ))}
    </div>
  );
}
