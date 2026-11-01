"use client";

import { Button, Stack, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

export default function PageError({ reset }: { reset: () => void }) {
  const router = useRouter();

  return (
    <Stack gap="sm" align="flex-start" py={64} maw={480}>
      <Title order={1}>This page failed to load</Title>
      <Text c="dimmed" size="sm">
        The parts API returned an error or could not be reached. Check that the
        katsukura server is running, then try again.
      </Text>
      <Button
        variant="default"
        mt="xs"
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      >
        Try again
      </Button>
    </Stack>
  );
}
