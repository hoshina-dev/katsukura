import {
  imageUrl,
  itemHref,
  parseCatalogQuery,
  parseCatalogView,
  skuHref,
  unitsLabel,
} from "./inventory";

describe("parseCatalogQuery", () => {
  it("falls back to defaults for missing or invalid params", () => {
    expect(parseCatalogQuery({ type: "bogus", page: "-2" })).toEqual({
      search: "",
      type: "all",
      stock: "all",
      page: 1,
    });
  });

  it("reads the first value of repeated params", () => {
    expect(
      parseCatalogQuery({ q: ["  bolt ", "nut"], type: "parts", stock: "in", page: "3" }),
    ).toEqual({ search: "bolt", type: "parts", stock: "in", page: 3 });
  });
});

describe("helpers", () => {
  it("parses the view", () => {
    expect(parseCatalogView({ view: "table" })).toBe("table");
    expect(parseCatalogView({})).toBe("grid");
  });

  it("only accepts non-empty string image urls", () => {
    expect(imageUrl({ image_url: "https://x/y.png" })).toBe("https://x/y.png");
    expect(imageUrl({ image_url: "" })).toBeNull();
    expect(imageUrl({ image_url: 1 })).toBeNull();
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
