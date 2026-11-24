import { fireEvent, screen, waitFor } from "@testing-library/react";

import { NavigationProvider, useSearchParams } from "@/libs/nav";
import { render } from "@/tests/utils";

import { BomDirectory } from "./BomPage";

const getCatalog = vi.fn();
vi.mock("@/libs/katsukuraApi", async (original) => ({
  ...(await original<typeof import("@/libs/katsukuraApi")>()),
  getCatalog: (...args: unknown[]) => getCatalog(...args),
  getCatalogFacets: () => Promise.resolve({
    category: [],
    manufacturer: [],
    country_of_origin: [],
    temperature_stage: [],
  }),
}));

function DirectoryFromURL() {
  return <BomDirectory params={Object.fromEntries(useSearchParams())} />;
}

function renderDirectory(path: string) {
  window.history.replaceState(null, "", path);
  return render(
    <NavigationProvider>
      <DirectoryFromURL />
    </NavigationProvider>,
  );
}

describe("BOM directory filters", () => {
  beforeEach(() => {
    getCatalog.mockReset();
    getCatalog.mockResolvedValue({ entries: [], total: 0 });
  });

  it("removing the default assembly filter switches to all units", async () => {
    renderDirectory("/bom");
    await screen.findByText("No bills of materials yet");
    expect(getCatalog).toHaveBeenLastCalledWith({
      search: "", sort: "name", page: 1, filters: { unit_type: "assembly" },
    }, 25);

    fireEvent.click(screen.getByRole("button", { name: "Remove Unit type filter" }));
    await screen.findByText("No units yet");
    expect(window.location.search).toBe("?unit_type=all");
    expect(getCatalog).toHaveBeenLastCalledWith({ search: "", sort: "name", page: 1 }, 25);
  });

  it("starts a BOM with eligible units and preserves the current sort", async () => {
    renderDirectory("/bom?sort=price&order=desc&q=old&stock=available&page=2");
    fireEvent.click(screen.getByRole("button", { name: "Start a BOM" }));

    await waitFor(() => expect(getCatalog).toHaveBeenLastCalledWith({
      search: "",
      sort: "price",
      order: "desc",
      page: 1,
      filters: { unit_type: "part", bom_editing: "editable" },
    }, 25));
    expect(await screen.findByText("No units are ready for a new BOM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New unit" })).toHaveAttribute("href", "/units/new");
  });
});
