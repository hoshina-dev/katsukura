import {
  imageUrls,
  itemHref,
  parseCatalogQuery,
  parseCatalogView,
  skuHref,
  unitsLabel,
} from "./inventory";

describe("parseCatalogQuery", () => {
  it("falls back to defaults for missing or invalid params", () => {
    expect(
      parseCatalogQuery({ type: "bogus", sort: "price", page: "-2" }),
    ).toEqual({
      search: "",
      type: "all",
      stock: "all",
      sort: "default",
      page: 1,
    });
  });

  it("reads the first value of repeated params", () => {
    expect(
      parseCatalogQuery({
        q: ["  bolt ", "nut"],
        type: "parts",
        stock: "in",
        sort: "amount",
        page: "3",
      }),
    ).toEqual({
      search: "bolt",
      type: "parts",
      stock: "in",
      sort: "amount",
      page: 3,
    });
  });
});

describe("helpers", () => {
  it("parses the view", () => {
    expect(parseCatalogView({ view: "table" })).toBe("table");
    expect(parseCatalogView({})).toBe("grid");
  });

  it("keeps non-empty image urls in order", () => {
    expect(
      imageUrls({ image_urls: ["https://x/a.png", "", "https://x/b.png"] }),
    ).toEqual(["https://x/a.png", "https://x/b.png"]);
    expect(imageUrls({})).toEqual([]);
    expect(imageUrls({ image_urls: null })).toEqual([]);
  });

  it("encodes SKUs in links", () => {
    expect(skuHref("A/B 1")).toBe("/inventory/A%2FB%201");
    expect(itemHref("A", "id")).toBe("/inventory/A/items/id");
  });

  it("pluralizes units", () => {
    expect(unitsLabel(1)).toBe("1 unit");
    expect(unitsLabel(0)).toBe("0 units");
  });
});
