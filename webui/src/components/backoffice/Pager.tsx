"use client";

import { Button, Group, NumberInput, Text } from "@mantine/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { isPositiveInt } from "@/libs/inventory";

// Updates search params in place; changing a filter resets the catalog page.
// push adds a history entry, so Back returns to the previous params.
export function useSearchParamUpdate() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const update = useCallback(
    (
      changes: Record<string, string | null>,
      resetPage = true,
      push = false,
    ) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (resetPage) next.delete("page");
      const search = next.toString();
      const href = search ? `${pathname}?${search}` : pathname;
      if (push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [params, pathname, router],
  );

  return { params, update };
}

interface PagerProps {
  page: number;
  pageCount: number;
  total: number;
  // Search param holding the page number
  param?: string;
}

// Previous / page number (1 to pageCount) / Next
export function Pager({ page, pageCount, total, param = "page" }: PagerProps) {
  const { update } = useSearchParamUpdate();
  const [draft, setDraft] = useState<string | number>(page);

  useEffect(() => setDraft(page), [page]);

  const goTo = (next: number) =>
    update({ [param]: next > 1 ? String(next) : null }, false);
  const typed = Number(draft);
  const typedPage = isPositiveInt(typed) && typed <= pageCount ? typed : null;
  const commit = () => {
    if (typedPage === null) setDraft(page);
    else if (typedPage !== page) goTo(typedPage);
  };
  // Clicking a button blurs the field first, and that blur already went to
  // the typed page; stepping from the stale page prop would override it
  const step = (by: number) => {
    if (typedPage !== null && typedPage !== page) return;
    goTo(page + by);
  };

  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        {total} {total === 1 ? "result" : "results"}
      </Text>
      <Group gap="xs">
        <Button
          variant="default"
          size="sm"
          disabled={page <= 1}
          onClick={() => step(-1)}
        >
          Previous
        </Button>
        <Group gap={6} wrap="nowrap">
          <Text size="sm">Page</Text>
          <NumberInput
            aria-label="Page"
            value={draft}
            onChange={setDraft}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
            min={1}
            max={pageCount}
            clampBehavior="strict"
            allowDecimal={false}
            allowNegative={false}
            hideControls
            w={64}
            size="sm"
          />
          <Text size="sm">of {pageCount}</Text>
        </Group>
        <Button
          variant="default"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => step(1)}
        >
          Next
        </Button>
      </Group>
    </Group>
  );
}
