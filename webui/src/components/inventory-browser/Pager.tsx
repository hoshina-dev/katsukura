"use client";

import { Button, Group, NumberInput, Text } from "@mantine/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Updates search params in place; changing a filter resets the catalog page
export function useSearchParamUpdate() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const update = useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (resetPage) next.delete("page");
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
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
  const commit = () => {
    const next = Number(draft);
    if (Number.isInteger(next) && next >= 1 && next <= pageCount) {
      if (next !== page) goTo(next);
    } else {
      setDraft(page);
    }
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
          onClick={() => goTo(page - 1)}
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
          onClick={() => goTo(page + 1)}
        >
          Next
        </Button>
      </Group>
    </Group>
  );
}
