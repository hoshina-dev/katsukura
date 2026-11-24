import { screen, waitFor } from "@testing-library/react";

import type { CatalogEntry } from "@/libs/inventory";
import { render } from "@/tests/utils";

import { CatalogTable } from "./CatalogTable";

const loadCatalogPage = vi.fn();
vi.mock("@/app/actions", () => ({
  loadCatalogPage: (...args: unknown[]) => loadCatalogPage(...args),
  deletePart: vi.fn(),
  partDeleteBlocker: vi.fn(),
}));
vi.mock("@/libs/nav", async (original) => ({
  ...(await original<typeof import("@/libs/nav")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
// The load-more marker is always in view
vi.mock("@mantine/hooks", async (original) => ({
  ...(await original<typeof import("@mantine/hooks")>()),
  useIntersection: () => ({ ref: vi.fn(), entry: { isIntersecting: true } }),
}));

const entry = (n: number): CatalogEntry => ({
  id: `id-${n}`,
  sku: `SKU-${n}`,
  name: `Unit ${n}`,
  description: n === 1 ? "Body with paint" : null,
  imageUrl: null,
  stock: { total: 0, in_use: 0, available: 0 },
  componentCount: n === 1 ? 2 : 0,
  effectiveUnitPrice: "0.00",
  hasUnitPriceOverride: false,
});

const query = { search: "", sort: "default" as const, page: 1 };

describe("CatalogTable", () => {
  beforeEach(() => loadCatalogPage.mockReset());

  it("loads more after the rows already shown", async () => {
    loadCatalogPage.mockResolvedValue({ entries: [entry(3)], total: 3 });
    render(
      <CatalogTable entries={[entry(1), entry(2)]} total={3} query={query} />,
    );
    await waitFor(() => expect(loadCatalogPage).toHaveBeenCalledWith(query, 2));
    expect(await screen.findByText("Unit 3")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 units")).toBeInTheDocument();
  });

  it("shows the description and assembly badge", () => {
    render(<CatalogTable entries={[entry(1)]} total={1} query={query} />);
    expect(screen.getByText("Body with paint")).toBeInTheDocument();
    expect(screen.getByText("Assembly · 2 slots")).toBeInTheDocument();
  });
});
