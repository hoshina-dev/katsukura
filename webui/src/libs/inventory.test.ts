import {
  imageUrls,
  isPositiveInt,
  itemHref,
  parseCatalogQuery,
  parseCatalogView,
  serialLabel,
  skuHref,
  unitsLabel,
} from "./inventory";

describe("parseCatalogQuery", () => {
  it("falls back to defaults for missing or invalid params", () => {
    expect(parseCatalogQuery({ sort: "price", page: "-2" })).toEqual({
      search: "",
      sort: "default",
      page: 1,
    });
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
