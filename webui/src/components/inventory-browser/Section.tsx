import { Card, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function Section({ title, description, children }: SectionProps) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
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
        {children}
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
