import { Container } from "@mantine/core";
import { useMemo } from "react";

import { AppHeader } from "@/components/backoffice/AppHeader";
import { BomGraphPage } from "@/components/backoffice/BomGraphPage";
import { BomDetail, BomDirectory } from "@/components/backoffice/BomPage";
import { Catalog } from "@/components/backoffice/CatalogResults";
import { ItemDetail } from "@/components/backoffice/ItemDetail";
import { SkuDetail } from "@/components/backoffice/SkuDetail";
import { usePathname, useSearchParams } from "@/libs/nav";
import type { SearchParams } from "@/libs/inventory";

import { NotFound } from "./not-found";
import NewUnitPage from "./units/new/page";

function decodeSeg(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toSearchParams(search: URLSearchParams): SearchParams {
  const params: SearchParams = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  return params;
}

export function App() {
  const pathname = usePathname();
  const search = useSearchParams();
  const params = useMemo(() => toSearchParams(search), [search]);

  let page;
  const item = pathname.match(/^\/units\/([^/]+)\/items\/([^/]+)\/?$/);
  const unit = pathname.match(/^\/units\/([^/]+)\/?$/);
  const bom = pathname.match(/^\/bom\/([^/]+)\/?$/);
  if (pathname === "/") page = <Catalog params={params} />;
  else if (pathname === "/bom" || pathname === "/bom/")
    page = <BomDirectory params={params} />;
  else if (pathname === "/bom/graph" || pathname === "/bom/graph/")
    page = <BomGraphPage />;
  else if (bom)
    page = <BomDetail key={bom[1]} partId={decodeSeg(bom[1])} />;
  else if (pathname === "/units/new") page = <NewUnitPage />;
  else if (item)
    page = <ItemDetail itemId={decodeSeg(item[2])} />;
  else if (unit)
    page = <SkuDetail sku={decodeSeg(unit[1])} params={params} />;
  else page = <NotFound />;

  return (
    <>
      <AppHeader />
      <Container component="main" size={1280} py="lg" px="md">
        {page}
      </Container>
    </>
  );
}
