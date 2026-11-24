import {
  imageUrls,
  isPositiveInt,
  itemHref,
  parseBomCatalogQuery,
  parseCatalogQuery,
  parseCatalogView,
  serialLabel,
  skuHref,
  itemsLabel,
} from "./inventory";

describe("parseCatalogQuery", () => {
  it("falls back to defaults for missing or invalid params", () => {
    expect(parseCatalogQuery({ sort: "unknown", order: "unknown", page: "-2" })).toEqual({
      search: "",
      sort: "default",
      page: 1,
    });
  });

  it("keeps a price sort and product filters together", () => {
    expect(
      parseCatalogQuery({
        sort: "price", order: "desc", manufacturer: " Acme ", stock: "available", page: "2",
      }),
    ).toEqual({
      search: "",
      sort: "price",
      order: "desc",
      filters: { manufacturer: "Acme", stock: "available" },
      page: 2,
    });
    expect(parseCatalogQuery({}, "name").sort).toBe("name");
  });

  it("reads the first value of repeated params", () => {
    expect(
      parseCatalogQuery({
        q: ["  bolt ", "nut"],
        sort: "amount",
        page: "3",
      }),
    ).toEqual({
      search: "bolt",
      sort: "amount",
      page: 3,
    });
  });
});

describe("parseBomCatalogQuery", () => {
  it("defaults to assemblies and keeps explicit or legacy all-units links", () => {
    expect(parseBomCatalogQuery({}).filters).toEqual({ unit_type: "assembly" });
    expect(parseBomCatalogQuery({ unit_type: "all" }).filters).toBeUndefined();
    expect(parseBomCatalogQuery({ view: "all" }).filters).toBeUndefined();
    expect(parseBomCatalogQuery({ view: "all", unit_type: "part", bom_editing: "editable" }).filters)
      .toEqual({ unit_type: "part", bom_editing: "editable" });
  });
});

describe("helpers", () => {
  it("labels serial numbers", () => {
    expect(serialLabel({ serial_number: "SN-1" })).toBe("SN-1");
    expect(serialLabel({ serial_number: null })).toBe("Unserialized");
    expect(serialLabel(undefined)).toBe("Unserialized");
  });

  it("accepts only whole quantities of at least 1", () => {
    expect([1, "3", 0, -1, 1.5, "", "x"].map(isPositiveInt)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("parses the view", () => {
    expect(parseCatalogView({ view: "grid" })).toBe("grid");
    expect(parseCatalogView({})).toBe("table");
  });

  it("keeps non-empty image urls in order", () => {
    expect(
      imageUrls({ image_urls: ["https://x/a.png", "", "https://x/b.png"] }),
    ).toEqual(["https://x/a.png", "https://x/b.png"]);
    expect(imageUrls({})).toEqual([]);
    expect(imageUrls({ image_urls: null })).toEqual([]);
  });

  it("encodes SKUs in links", () => {
    expect(skuHref("A/B 1")).toBe("/units/A%2FB%201");
    expect(itemHref("A", "id")).toBe("/units/A/items/id");
  });

  it("pluralizes items", () => {
    expect(itemsLabel(1)).toBe("1 item");
    expect(itemsLabel(0)).toBe("0 items");
  });
});
