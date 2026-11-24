import { Select, TableTh, UnstyledButton, type TableThProps } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconArrowsSort } from "@tabler/icons-react";

import {
  catalogSortDefaults,
  type CatalogOrder,
  type CatalogQuery,
  type CatalogSort,
} from "@/libs/inventory";

import { useSearchParamUpdate } from "./Pager";

const sortLabels: Record<CatalogSort, Record<CatalogOrder, string>> = {
  default: { asc: "Oldest first", desc: "Newest first" },
  name: { asc: "Name, A–Z", desc: "Name, Z–A" },
  price: { asc: "Lowest price", desc: "Highest price" },
  amount: { asc: "Least total stock", desc: "Most total stock" },
  in_use: { asc: "Fewest in use", desc: "Most in use" },
  available: { asc: "Fewest available", desc: "Most available" },
  utilisation: { asc: "Lowest utilisation", desc: "Highest utilisation" },
  slots: { asc: "Fewest slots", desc: "Most slots" },
  editing: { asc: "Editable first", desc: "Locked first" },
};

export const unitSortFields = [
  "default", "name", "price", "amount", "in_use", "available", "utilisation",
] as const;

export function CatalogSortSelect({
  query,
  fields,
}: {
  query: CatalogQuery;
  fields: readonly CatalogSort[];
}) {
  const { update } = useSearchParamUpdate();
  const visibleFields = fields.includes(query.sort) ? fields : [...fields, query.sort];
  return (
    <Select
      aria-label="Sort"
      data={visibleFields.flatMap((field) =>
        (["asc", "desc"] as const).map((order) => ({
          value: `${field}:${order}`,
          label: sortLabels[field][order],
        })),
      )}
      value={`${query.sort}:${query.order ?? catalogSortDefaults[query.sort]}`}
      onChange={(value) => {
        if (value) {
          const [sort, order] = value.split(":");
          update({ sort, order }, true, true);
        }
      }}
      allowDeselect={false}
      w={160}
    />
  );
}

export function CatalogSortHeader({
  label,
  field,
  query,
  ...props
}: TableThProps & { label: string; field: CatalogSort; query: CatalogQuery }) {
  const { update } = useSearchParamUpdate();
  const active = query.sort === field;
  const order = active ? query.order ?? catalogSortDefaults[field] : null;
  const next = order ? (order === "asc" ? "desc" : "asc") : catalogSortDefaults[field];
  const Icon = order === "asc" ? IconArrowUp : order === "desc" ? IconArrowDown : IconArrowsSort;
  return (
    <TableTh
      {...props}
      scope="col"
      aria-sort={order ? (order === "asc" ? "ascending" : "descending") : undefined}
    >
      <UnstyledButton
        className="catalog-sort-header"
        data-active={active || undefined}
        aria-label={`Sort by ${label}, ${next === "asc" ? "ascending" : "descending"}`}
        onClick={() => update({ sort: field, order: next }, true, true)}
      >
        {label}
        <Icon size={14} aria-hidden />
      </UnstyledButton>
    </TableTh>
  );
}
