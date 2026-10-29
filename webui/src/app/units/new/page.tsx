import { Stack } from "@mantine/core";

import { PageHeader } from "@/components/backoffice/PageHeader";

import { AddPartForm } from "./AddPartForm";

export default function NewUnitPage() {
  return (
    <Stack gap="lg">
      <PageHeader trail={[{ href: "/", label: "Units" }]} title="New unit" />
      <AddPartForm />
    </Stack>
  );
}
