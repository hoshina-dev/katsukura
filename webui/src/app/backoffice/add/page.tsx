import { Stack, Text, Title } from "@mantine/core";
import { connection } from "next/server";

import { TextLink } from "@/components/inventory-browser/TextLink";
import { getMetadataSchema } from "@/libs/papiRest";

import { AddPartForm } from "./AddPartForm";

export default async function AddPartPage() {
  // Render per request; the schema comes from the API, not the build
  await connection();
  const schema = await getMetadataSchema();

  return (
    <Stack gap="xl">
      <TextLink href="/backoffice">← Back to inventory management</TextLink>

      <div>
        <Title order={1}>Add part</Title>
        <Text c="dimmed">Create a new SKU schema</Text>
      </div>

      <AddPartForm metadataKeys={Object.keys(schema.properties ?? {})} />
    </Stack>
  );
}
