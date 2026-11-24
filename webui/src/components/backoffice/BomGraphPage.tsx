import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Select,
  Skeleton,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowsMaximize,
  IconMinus,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PageError } from "@/app/error";
import { BOM_NODE_HEIGHT, BOM_NODE_WIDTH, layoutBomGraph } from "@/libs/bomGraph";
import { bomHref, type BomGraph, type BomSlot } from "@/libs/inventory";
import { getBomGraph } from "@/libs/katsukuraApi";
import { Link, useRefreshToken } from "@/libs/nav";

import { PageHeader } from "./PageHeader";

type Layout = ReturnType<typeof layoutBomGraph>;
type SelectUnit = (id: string | null) => void;

export function BomGraphPage() {
  const token = useRefreshToken();
  const [result, setResult] = useState<BomGraph | { error: string }>();

  useEffect(() => {
    let current = true;
    getBomGraph(true)
      .then((graph) => {
        if (current) setResult(graph);
      })
      .catch((error: unknown) => {
        if (current) {
          setResult({
            error:
              error instanceof Error
                ? error.message
                : "Could not load the dependency graph",
          });
        }
      });
    return () => {
      current = false;
    };
  }, [token]);

  if (result && "error" in result) return <PageError message={result.error} />;

  return (
    <Stack gap="md">
      <PageHeader
        title="Dependency graph"
        trail={[{ href: "/bom", label: "Bill of materials" }]}
      />
      {result ? (
        <GraphWorkspace graph={result} />
      ) : (
        <Skeleton height={360} aria-label="Loading the dependency graph" />
      )}
    </Stack>
  );
}

function GraphWorkspace({ graph }: { graph: BomGraph }) {
  const [showArchived, setShowArchived] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = useMemo(() => {
    if (showArchived) return graph;
    const units = graph.units.filter((unit) => !unit.archived_at);
    const ids = new Set(units.map((unit) => unit.id));
    const slots = graph.slots.filter(
      (slot) => ids.has(slot.parent_part_id) && ids.has(slot.child_part_id),
    );
    return { units, slots };
  }, [graph, showArchived]);
  const layout = useMemo(() => layoutBomGraph(visible), [visible]);
  const options = useMemo(
    () =>
      visible.units.map((unit) => ({
        value: unit.id,
        label: `${unit.name} · ${unit.sku}${unit.archived_at ? " · Archived" : ""}`,
      })),
    [visible.units],
  );
  const selected = selectedId ? layout.nodes.get(selectedId) : undefined;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Select
          aria-label="Find a unit in the graph"
          placeholder="Find a unit by name or SKU"
          leftSection={<IconSearch size={16} />}
          searchable
          clearable
          clearButtonProps={{ "aria-label": "Clear selected unit" }}
          nothingFoundMessage="No matching units"
          limit={30}
          data={options}
          value={selected?.unit.id ?? null}
          onChange={setSelectedId}
          style={{ flex: "1 1 250px", maxWidth: 460 }}
        />
        <Switch
          label="Show archived units"
          checked={showArchived}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            if (!checked && selected?.unit.archived_at) setSelectedId(null);
            setShowArchived(checked);
          }}
        />
      </Group>
      {layout.ordered.length > 0 ? (
        <div className="bom-graph-workspace">
          <GraphViewport layout={layout} selected={selected} onSelect={setSelectedId} />
          <GraphInspector layout={layout} selected={selected} onSelect={setSelectedId} />
        </div>
      ) : (
        <Box className="panel" p="xl">
          <Text ta="center">{showArchived ? "No units yet" : "No active units"}</Text>
        </Box>
      )}
    </Stack>
  );
}

type GraphViewProps = {
  layout: Layout;
  selected: Layout["ordered"][number] | undefined;
  onSelect: SelectUnit;
};

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;

function fitZoom(region: HTMLDivElement, width: number, height: number | null) {
  const horizontal = region.clientWidth / width;
  const vertical = height ? region.clientHeight / height : 1;
  return Math.max(MIN_ZOOM, Math.min(1, horizontal, vertical));
}

function GraphViewport({ layout, selected, onSelect }: GraphViewProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const initialized = useRef(false);
  const [zoom, setZoom] = useState(1);
  const { linkedWidth, linkedHeight } = layout;

  useEffect(() => {
    const region = viewport.current;
    if (region && !initialized.current) {
      setZoom(Math.max(0.7, fitZoom(region, linkedWidth, linkedHeight)));
      initialized.current = true;
    }
  }, [linkedWidth, linkedHeight]);

  useEffect(() => {
    const region = viewport.current;
    if (!region || !selected) return;
    const left = selected.x * zoom;
    const top = selected.y * zoom;
    const right = left + BOM_NODE_WIDTH * zoom;
    const bottom = top + BOM_NODE_HEIGHT * zoom;
    if (
      left < region.scrollLeft ||
      right > region.scrollLeft + region.clientWidth ||
      top < region.scrollTop ||
      bottom > region.scrollTop + region.clientHeight
    ) {
      region.scrollTo({
        left: (left + right - region.clientWidth) / 2,
        top: (top + bottom - region.clientHeight) / 2,
      });
    }
  }, [selected, zoom]);

  const selectedId = selected?.unit.id;
  const neighbors = new Set([
    ...(selected?.incoming.map((slot) => slot.parent_part_id) ?? []),
    ...(selected?.outgoing.map((slot) => slot.child_part_id) ?? []),
  ]);
  const fit = () => {
    const region = viewport.current;
    if (!region) return;
    setZoom(fitZoom(region, linkedWidth, linkedHeight));
    region.scrollTo(0, 0);
  };

  return (
    <Box className="panel bom-graph-panel">
      <Group className="panel-header" px="sm" py="xs" justify="space-between">
        <Text size="sm" c="gray.7">
          {layout.ordered.length} {layout.ordered.length === 1 ? "unit" : "units"}
          {layout.edges.length > 0 && " · Arrows point to components"}
        </Text>
        <Group gap={4} wrap="nowrap" aria-label="Diagram controls">
          {layout.standaloneCount > 0 && layout.edges.length > 0 && (
            <Button
              size="compact-xs"
              variant="subtle"
              mr={4}
              onClick={() =>
                viewport.current?.scrollTo(0, (layout.standaloneTop - 12) * zoom)
              }
            >
              Standalone units
            </Button>
          )}
          <ActionIcon
            aria-label="Zoom out"
            variant="default"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - 0.2))}
          >
            <IconMinus size={16} />
          </ActionIcon>
          <Text size="xs" ta="center" w={43} className="tabular">
            {Math.round(zoom * 100)}%
          </Text>
          <ActionIcon
            aria-label="Zoom in"
            variant="default"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + 0.2))}
          >
            <IconPlus size={16} />
          </ActionIcon>
          <ActionIcon
            aria-label="Fit dependencies"
            title="Fit dependencies"
            variant="default"
            ml={4}
            onClick={fit}
          >
            <IconArrowsMaximize size={16} />
          </ActionIcon>
        </Group>
      </Group>
      <div
        className="bom-graph-viewport"
        ref={viewport}
        role="region"
        aria-label="BOM dependency diagram"
        tabIndex={0}
        onPointerDown={(event) => {
          if (
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            (event.target as Element).closest("button")
          ) return;
          drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.pointer !== event.pointerId) return;
          event.currentTarget.scrollBy(start.x - event.clientX, start.y - event.clientY);
          start.x = event.clientX;
          start.y = event.clientY;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <div
          className="bom-graph-frame"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
          <div
            className="bom-graph-sheet"
            style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}
          >
            <svg
              className="bom-graph-edges"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="bom-arrow"
                  markerUnits="userSpaceOnUse"
                  markerWidth={9}
                  markerHeight={8}
                  refX={8}
                  refY={4}
                  orient="auto"
                >
                  <path d="M0 0 L8 4 L0 8 Z" />
                </marker>
              </defs>
              {layout.edges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.path}
                  className="bom-graph-edge"
                  data-highlighted={edge.from === selectedId || edge.to === selectedId || undefined}
                  markerEnd="url(#bom-arrow)"
                />
              ))}
            </svg>
            {layout.standaloneCount > 0 && (
              <div className="bom-graph-standalone" style={{ top: layout.standaloneTop }}>
                Standalone units <span>{layout.standaloneCount}</span>
              </div>
            )}
            {layout.ordered.map(({ unit, x, y }) => (
              <button
                type="button"
                key={unit.id}
                className="bom-graph-node"
                style={{ left: x, top: y, width: BOM_NODE_WIDTH, height: BOM_NODE_HEIGHT }}
                title={`${unit.name} · ${unit.sku}`}
                aria-pressed={selectedId === unit.id}
                data-related={neighbors.has(unit.id) || undefined}
                data-archived={Boolean(unit.archived_at) || undefined}
                onClick={() => onSelect(unit.id)}
              >
                <span className="bom-graph-node-name">{unit.name}</span>
                <span className="bom-graph-node-meta">
                  <span className="bom-graph-node-sku">{unit.sku}</span>
                  {unit.archived_at && <span className="bom-graph-node-archive">Archived</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Box>
  );
}

function GraphInspector({ layout, selected, onSelect }: GraphViewProps) {
  return (
    <Box component="aside" aria-label="Unit relationships" className="panel bom-graph-inspector">
      <Stack gap="md" p="md">
        {selected ? (
          <>
            <div aria-live="polite">
              <Title order={2} style={{ overflowWrap: "anywhere" }}>
                {selected.unit.name}
              </Title>
              <Text size="xs" c="gray.7" ff="monospace" style={{ overflowWrap: "anywhere" }}>
                {selected.unit.sku}
              </Text>
            </div>
            {selected.unit.archived_at ? (
              <Badge variant="outline" color="gray">
                Archived
              </Badge>
            ) : (
              <Button
                component={Link}
                href={bomHref(selected.unit.id)}
                variant="default"
                size="xs"
                w="fit-content"
              >
                Open BOM
              </Button>
            )}
            <RelationList
              title="Components"
              slots={selected.outgoing}
              layout={layout}
              onSelect={onSelect}
            />
            <RelationList
              title="Used in"
              slots={selected.incoming}
              reverse
              layout={layout}
              onSelect={onSelect}
            />
          </>
        ) : (
          <>
            <Title order={2}>Unit relationships</Title>
            <Text size="sm" c="gray.7">
              Select a unit to see its components and the assemblies that use it.
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

function RelationList({ title, slots, reverse, layout, onSelect }: {
  title: string;
  slots: BomSlot[];
  reverse?: boolean;
  layout: Layout;
  onSelect: SelectUnit;
}) {
  return (
    <Stack gap={6}>
      <Title order={3}>{title}</Title>
      {slots.length === 0 ? (
        <Text size="sm" c="gray.7">{reverse ? "No parent assemblies" : "No components"}</Text>
      ) : (
        <Stack component="ul" gap={0} m={0} p={0} className="bom-graph-relations">
          {slots.map((slot) => {
            const id = reverse ? slot.parent_part_id : slot.child_part_id;
            const unit = layout.nodes.get(id)!.unit;
            return (
              <li key={slot.id}>
                <UnstyledButton className="bom-graph-relation" onClick={() => onSelect(id)}>
                  <span>
                    <Text span size="sm" fw={500} c="signal.9">{unit.name}</Text>
                    <Text display="block" size="xs" c="gray.7" component="span" ff="monospace">
                      {slot.slot}
                    </Text>
                  </span>
                  <Text span size="sm" className="tabular" aria-label={`Quantity ${slot.required_quantity}`}>
                    ×{slot.required_quantity}
                  </Text>
                </UnstyledButton>
              </li>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
