"use client";

import { Button, Card, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

export default function InventoryError({ reset }: { reset: () => void }) {
  const router = useRouter();

  return (
    <Card withBorder radius="md" padding="xl">
      <Stack gap="sm" align="center" py="xl">
        <Text fw={600}>Could not load inventory</Text>
        <Text size="sm" c="dimmed">
          Something went wrong while fetching data.
        </Text>
        <Button
          variant="default"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Retry
        </Button>
      </Stack>
    </Card>
  );
}
