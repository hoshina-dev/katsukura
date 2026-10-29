import { Stack } from "@mantine/core";

import { PageHeader } from "@/components/backoffice/PageHeader";

import { AddPartForm } from "./AddPartForm";

export default function NewPartPage() {
  return (
    <Stack gap="lg">
      <PageHeader trail={[{ href: "/", label: "Parts" }]} title="New part" />
      <AddPartForm />
    </Stack>
  );
}
