import {
  Box,
  Button,
  Collapse,
  Group,
  Pill,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";
import { useEffect, useId, useState } from "react";

import { getCountryName } from "@/libs/countries";
import {
  type CatalogFacets,
  type CatalogFilter,
  catalogFilterKeys,
  type CatalogFilters,
} from "@/libs/inventory";
import { getCatalogFacets } from "@/libs/katsukuraApi";
import { useRefreshToken, useRouter } from "@/libs/nav";

import { useSearchParamUpdate } from "./Pager";

const labels: Record<CatalogFilter, string> = {
  unit_type: "Unit type",
  bom_editing: "BOM editing",
  category: "Category",
  manufacturer: "Manufacturer",
  country_of_origin: "Country of origin",
  temperature_stage: "Temperature stage",
  stock: "Stock",
  tracking: "Tracking",
};

const fixedOptions: Partial<Record<CatalogFilter, Record<string, string>>> = {
  unit_type: { all: "All units", assembly: "Assemblies", part: "Units without a BOM" },
  bom_editing: { editable: "Editable", locked: "Locked" },
  stock: { available: "Available items", in_use: "All items in use", empty: "No items" },
  tracking: { serial: "Serial numbers", quantity: "Quantity only" },
};

function optionLabel(field: CatalogFilter, value: string) {
  if (field === "country_of_origin") return getCountryName(value) ?? value;
  const options = fixedOptions[field];
  return options && Object.hasOwn(options, value) ? options[value] : value;
}

export function clearedCatalogFilters(bom: boolean): Record<string, string | null> {
  const changes = Object.fromEntries(catalogFilterKeys.map((field) => [field, null]));
  return bom ? { ...changes, unit_type: "all", view: null } : changes;
}

export function ClearCatalogFiltersButton({ bom = false }: { bom?: boolean }) {
  const { update } = useSearchParamUpdate();
  return (
    <Button
      variant="subtle"
      size="sm"
      onClick={() => update(clearedCatalogFilters(bom), true, true)}
    >
      Clear filters
    </Button>
  );
}

export function CatalogFiltersControl({
  filters = {},
  bom = false,
}: {
  filters?: CatalogFilters;
  bom?: boolean;
}) {
  const { update } = useSearchParamUpdate();
  const [open, setOpen] = useState(false);
  const [facets, setFacets] = useState<{ unitType: string; data: CatalogFacets | null }>();
  const id = useId();
  const token = useRefreshToken();
  const router = useRouter();
  const active = catalogFilterKeys.flatMap((field) => {
    const value = filters[field];
    return value ? [{ field, value }] : [];
  });
  const unitType = filters.unit_type ?? "all";
  const data = facets?.unitType === unitType ? facets.data : undefined;

  useEffect(() => {
    let current = true;
    getCatalogFacets(unitType)
      .then((data) => {
        if (current) setFacets({ unitType, data });
      })
      .catch(() => {
        if (current) setFacets({ unitType, data: null });
      });
    return () => {
      current = false;
    };
  }, [unitType, token]);

  const setFilter = (field: CatalogFilter, value: string | null) => {
    if (field === "unit_type" && bom) {
      update({ unit_type: value ?? "all", view: null }, true, true);
      return;
    }
    update({ [field]: field === "unit_type" && value === "all" ? null : value }, true, true);
  };

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Button
          variant="default"
          leftSection={<IconFilter size={16} />}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          Filters
        </Button>
        {active.map(({ field, value }) => (
          <Pill
            key={field}
            withRemoveButton
            removeButtonProps={{
              "aria-label": `Remove ${labels[field]} filter`,
              "aria-hidden": false,
              tabIndex: 0,
            }}
            onRemove={() => setFilter(field, null)}
          >
            {labels[field]} · {optionLabel(field, value)}
          </Pill>
        ))}
        {active.length > 1 && <ClearCatalogFiltersButton bom={bom} />}
      </Group>
      <Collapse in={open} id={id}>
        <Box className="panel" p="sm">
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
            {catalogFilterKeys.map((field) => {
              if (field === "bom_editing" && !bom) return null;
              const fixed = fixedOptions[field];
              const values = fixed ? Object.keys(fixed) : data?.[field as keyof CatalogFacets] ?? [];
              const value = field === "unit_type" ? unitType : filters[field] ?? null;
              const options = value !== null && !values.includes(value)
                ? [...values, value]
                : values;
              return (
                <Select
                  key={field}
                  label={labels[field]}
                  placeholder={options.length > 0 ? "Any" : data === undefined ? "Loading…" : "No options"}
                  data={options.map((value) => ({ value, label: optionLabel(field, value) }))}
                  value={value}
                  searchable={!fixed}
                  clearable={field !== "unit_type"}
                  allowDeselect={field !== "unit_type"}
                  clearButtonProps={{ "aria-label": `Clear ${labels[field]} filter` }}
                  disabled={options.length === 0}
                  onChange={(value) => setFilter(field, value)}
                  nothingFoundMessage="No matching values"
                />
              );
            })}
          </SimpleGrid>
          {data === null && (
            <Group mt="sm" gap="xs">
              <Text size="sm" c="dimmed">Could not load product filter options.</Text>
              <Button variant="subtle" size="compact-sm" onClick={() => router.refresh()}>
                Try again
              </Button>
            </Group>
          )}
        </Box>
      </Collapse>
    </Stack>
  );
}
