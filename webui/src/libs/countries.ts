import type { OptionsFilter } from "@mantine/core";
import * as countries from "i18n-iso-countries";

// Local copy of the English locale — run `pnpm copy:country-locale` to refresh.
// Edit this file to override any country names before rebuilding.
import locale from "./data/countries-en.json";

countries.registerLocale(locale);

const names = countries.getNames("en", { select: "official" });

/** Sorted list of { label: full country name, value: alpha-3 code } for use in Select inputs. */
export const countrySelectData: { label: string; value: string }[] =
  Object.entries(names)
    .map(([alpha2, name]) => ({
      label: name,
      value: countries.alpha2ToAlpha3(alpha2) ?? alpha2,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

/**
 * Common search aliases keyed by alpha-3 code (all lowercase).
 * These cover abbreviations and alternate names not captured by the display label.
 * Add entries here as needed.
 */
const COUNTRY_ALIASES: Record<string, readonly string[]> = {
  USA: ["usa", "u.s.a.", "america", "u.s."],
  GBR: ["uk", "britain", "great britain"],
  ARE: ["uae"],
};

/**
 * Mantine OptionsFilter that matches on both the display label and any
 * registered alias, so e.g. typing "USA" finds "United States".
 */
export const countryOptionsFilter: OptionsFilter = ({ options, search }) => {
  const query = search.toLowerCase().trim();
  if (!query) return options;
  return options.filter((item) => {
    if (!("value" in item)) return false; // skip groups (won't occur here)
    if (item.label.toLowerCase().includes(query)) return true;
    return (COUNTRY_ALIASES[item.value] ?? []).some((alias) =>
      alias.includes(query),
    );
  });
};

/**
 * Resolve an alpha-3 country code to a full English name.
 * Returns undefined for unknown codes so callers can fall back to the raw value.
 */
export function getCountryName(alpha3: string): string | undefined {
  return countries.getName(alpha3, "en") ?? undefined;
}
