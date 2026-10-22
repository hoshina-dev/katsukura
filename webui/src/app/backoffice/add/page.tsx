import { Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";

import { AddPartForm } from "./AddPartForm";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

export default async function AddPartPage() {
  // Render per request so every visit gets a fresh SKU
  await connection();
  const sku = `RF-${randomUUID().slice(0, 8).toUpperCase()}`;

  return (
    <Stack gap="xl">
      <Link href="/backoffice" style={linkStyle}>
        <Text size="sm" component="span">
          ← Back to inventory management
        </Text>
      </Link>

      <div>
        <Title order={1}>Add part</Title>
        <Text c="dimmed">Create a new SKU schema</Text>
      </div>

      <AddPartForm sku={sku} />
    </Stack>
  );
}
