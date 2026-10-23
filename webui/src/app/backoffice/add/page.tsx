import { Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { connection } from "next/server";

import { getMetadataSchema } from "@/libs/papiRest";

import { AddPartForm } from "./AddPartForm";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

export default async function AddPartPage() {
  // Render per request; the schema comes from the API, not the build
  await connection();
  const schema = await getMetadataSchema();

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

      <AddPartForm metadataKeys={Object.keys(schema.properties ?? {})} />
    </Stack>
  );
}
