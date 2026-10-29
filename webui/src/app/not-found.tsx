"use client";

import { Button, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";

export default function NotFound() {
  return (
    <Stack gap="sm" align="flex-start" py={64} maw={480}>
      <Title order={1}>Not found</Title>
      <Text c="dimmed" size="sm">
        No unit or item lives at this address. It may have been deleted, or the
        SKU in the link is wrong.
      </Text>
      <Button component={Link} href="/" variant="default" mt="xs">
        Go to units
      </Button>
    </Stack>
  );
}
