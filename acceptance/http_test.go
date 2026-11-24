//go:build integration

package acceptance

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/hoshina-dev/katsukura/internal/database"
	"github.com/hoshina-dev/katsukura/internal/repositories"
	"github.com/hoshina-dev/katsukura/internal/routes"
	"github.com/hoshina-dev/katsukura/internal/services"
	"github.com/hoshina-dev/katsukura/schema"
)

func realAPI(t *testing.T) *fiber.App {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL for HTTP/PostgreSQL acceptance tests")
	}
	admin, err := database.Connect(dsn)
	if err != nil {
		t.Fatal(err)
	}
	adminPool, err := admin.DB()
	if err != nil {
		t.Fatal(err)
	}
	schema := "http_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err = admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		adminPool.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
			t.Errorf("drop test schema: %v", err)
		}
		adminPool.Close()
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := database.Connect(u.String())
	if err != nil {
		t.Fatal(err)
	}
	pool, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pool.Close() })
	if err = database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	return routes.NewApp(services.New(repositories.New(db)), pool.PingContext)
}

func request(t *testing.T, app *fiber.App, method, path string, body any, status int) map[string]any {
	t.Helper()
	var input []byte
	var err error
	if body != nil {
		input, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, strings.NewReader(string(input)))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req, 10000)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != status {
		t.Fatalf("%s %s: status %d want %d; %s", method, path, res.StatusCode, status, b)
	}
	var data map[string]any
	if len(b) > 0 {
		if err = json.Unmarshal(b, &data); err != nil {
			t.Fatalf("%s %s non-JSON: %s", method, path, b)
		}
	}
	if status >= 400 {
		if _, ok := data["error"].(map[string]any); !ok {
			t.Fatalf("missing error envelope: %s", b)
		}
	}
	return data
}
func object(values ...any) map[string]any {
	result := map[string]any{}
	for i := 0; i < len(values); i += 2 {
		result[values[i].(string)] = values[i+1]
	}
	return result
}
func id(t *testing.T, data map[string]any) string {
	t.Helper()
	s, ok := data["id"].(string)
	if !ok {
		t.Fatalf("missing id: %+v", data)
	}
	return s
}

func expectError(t *testing.T, data map[string]any, code, constraint string) {
	t.Helper()
	e := data["error"].(map[string]any)
	if e["code"] != code || !strings.Contains(e["message"].(string), constraint) {
		t.Fatalf("expected error %s containing %q: %+v", code, constraint, e)
	}
}

func TestHTTPBOMGraph(t *testing.T) {
	app := realAPI(t)
	const graphPath = "/api/v1/bom/graph"
	empty := request(t, app, "GET", graphPath, nil, 200)
	if len(empty["units"].([]any)) != 0 || len(empty["slots"].([]any)) != 0 {
		t.Fatalf("expected an empty graph: %+v", empty)
	}

	part := func(sku string) string {
		return id(t, request(t, app, "POST", "/api/v1/parts", object("sku", sku, "name", sku), 201))
	}
	root, module, leaf, standalone, archived := part("ROOT"), part("MODULE"), part("LEAF"), part("STANDALONE"), part("ARCHIVED")
	addSlot := func(parent, child, slot string, quantity int) {
		request(t, app, "POST", "/api/v1/parts/"+parent+"/components", object("child_part_id", child, "slot", slot, "required_quantity", quantity), 201)
	}
	addSlot(root, module, "module", 1)
	addSlot(module, leaf, "fastener", 4)
	addSlot(root, leaf, "spare", 2)
	addSlot(archived, leaf, "retained", 3)
	request(t, app, "DELETE", "/api/v1/parts/"+archived, nil, 204)

	active := request(t, app, "GET", graphPath, nil, 200)
	if len(active["units"].([]any)) != 4 || len(active["slots"].([]any)) != 3 {
		t.Fatalf("expected active units and slots only: %+v", active)
	}
	all := request(t, app, "GET", graphPath+"?include_archived=true", nil, 200)
	nodes := map[string]map[string]any{}
	for _, value := range all["units"].([]any) {
		node := value.(map[string]any)
		nodes[id(t, node)] = node
	}
	if len(nodes) != 5 || nodes[standalone]["sku"] != "STANDALONE" || nodes[archived]["archived_at"] == nil {
		t.Fatalf("graph is missing standalone or archived units: %+v", nodes)
	}
	slots := map[string]map[string]any{}
	for _, value := range all["slots"].([]any) {
		slot := value.(map[string]any)
		slots[slot["slot"].(string)] = slot
	}
	if len(slots) != 4 || slots["fastener"]["child_part_id"] != leaf ||
		slots["fastener"]["required_quantity"] != float64(4) ||
		slots["retained"]["parent_part_id"] != archived {
		t.Fatalf("graph is missing BOM relationships: %+v", slots)
	}
	request(t, app, "GET", graphPath+"?include_archived=yes", nil, 400)
}

func TestHTTPPartsWithBOM(t *testing.T) {
	app := realAPI(t)
	part := func(sku, name string) string {
		return id(t, request(t, app, "POST", "/api/v1/parts", object("sku", sku, "name", name), 201))
	}
	leaf := part("ADAPTER", "Catalog adapter")
	bench := part("BENCH", "Catalog bench")
	cabinet := part("CABINET", "Catalog cabinet")
	drawer := part("DRAWER", "Catalog drawer")
	fixture := part("FIXTURE", "Fixture")
	addSlot := func(parent, slot string) {
		request(t, app, "POST", "/api/v1/parts/"+parent+"/components", object("child_part_id", leaf, "slot", slot, "required_quantity", 1), 201)
	}
	for _, parent := range []string{bench, cabinet, drawer, fixture} {
		addSlot(parent, "mount")
	}
	addSlot(bench, "spare_mount")
	request(t, app, "DELETE", "/api/v1/parts/"+drawer, nil, 204)

	path := "/api/v1/parts?search=Catalog&sort=name&limit=1"
	filtered := request(t, app, "GET", path+"&has_bom=true&offset=1", nil, 200)
	rows := filtered["data"].([]any)
	if filtered["total"] != float64(2) || len(rows) != 1 || id(t, rows[0].(map[string]any)) != cabinet {
		t.Fatalf("filtered page: %+v", filtered)
	}

	all := request(t, app, "GET", path+"&has_bom=false", nil, 200)
	rows = all["data"].([]any)
	if all["total"] != float64(3) || len(rows) != 1 || id(t, rows[0].(map[string]any)) != leaf {
		t.Fatalf("unfiltered page: %+v", all)
	}
	request(t, app, "GET", path+"&has_bom=yes", nil, 400)
}

func TestHTTPCatalogSortAndFilters(t *testing.T) {
	app := realAPI(t)
	const parts = "/api/v1/parts"
	part := func(sku, price string, serialAware bool, metadata map[string]any, extra map[string]any) string {
		body := object("sku", sku, "name", sku, "composite_price", price, "serial_aware", serialAware, "metadata", metadata)
		for key, value := range extra {
			body[key] = value
		}
		return id(t, request(t, app, "POST", parts, body, 201))
	}
	cable := part("CABLE", "10.00", true, object("category", []string{" RF ", "rf"}, "manufacturer", "Acme", "country_of_origin", "THA", "temperature_stage", 4), nil)
	bracket := part("BRACKET", "3.00", false, object("category", []string{"Mechanical"}, "manufacturer", "Acme"), nil)
	kit := part("KIT", "0.00", true, object("category", []string{"rf"}, "manufacturer", "ACME"), object("unit_price", "8.00"))
	part("SPARE", "9.00", true, object(), nil)
	for _, slot := range []struct {
		child, name string
		quantity    int
	}{{cable, "cables", 2}, {bracket, "mount", 1}} {
		request(t, app, "POST", parts+"/"+kit+"/components", object("child_part_id", slot.child, "slot", slot.name, "required_quantity", slot.quantity), 201)
	}
	request(t, app, "POST", parts+"/"+cable+"/items", object("count", 3, "serial_numbers", []string{"CABLE-1", "CABLE-2", "CABLE-3"}), 201)
	request(t, app, "POST", parts+"/"+bracket+"/items", object("count", 1), 201)
	request(t, app, "POST", parts+"/"+kit+"/items", object("count", 1), 201)

	check := func(query, want string, total int) {
		t.Helper()
		list := request(t, app, "GET", parts+"?"+query, nil, 200)
		var skus []string
		for _, item := range list["data"].([]any) {
			skus = append(skus, item.(map[string]any)["sku"].(string))
		}
		if strings.Join(skus, " ") != want || list["total"] != float64(total) {
			t.Fatalf("%s: got %v of %v, want %s of %d", query, skus, list["total"], want, total)
		}
	}
	check("sort=price", "BRACKET KIT SPARE CABLE", 4)
	check("sort=price&order=desc&limit=2&offset=1", "SPARE KIT", 4)
	check("sort=in_use_items", "CABLE BRACKET KIT SPARE", 4)
	check("sort=utilisation", "BRACKET CABLE KIT SPARE", 4)
	check("sort=editing", "SPARE BRACKET CABLE KIT", 4)
	check("sort=slots", "KIT BRACKET CABLE SPARE", 4)
	check("category=rf&manufacturer=acme&sort=price", "KIT CABLE", 2)
	check("country_of_origin=tha&temperature_stage=4.0", "CABLE", 1)
	check("category=rf&has_bom=true", "KIT", 1)
	check("unit_type=assembly&bom_editing=locked", "KIT", 1)
	check("unit_type=assembly&bom_editing=editable", "", 0)
	check("unit_type=part&bom_editing=editable", "SPARE", 1)
	check("unit_type=all&bom_editing=locked&sort=name", "BRACKET CABLE KIT", 3)
	check("stock=available&sort=name", "CABLE KIT", 2)
	check("stock=in_use&tracking=quantity", "BRACKET", 1)
	check("stock=empty", "SPARE", 1)
	request(t, app, "GET", parts+"?order=no", nil, 400)
	request(t, app, "GET", parts+"?unit_type=unknown", nil, 400)
	request(t, app, "GET", parts+"?bom_editing=unknown", nil, 400)
	request(t, app, "GET", parts+"?temperature_stage=%22bad%22", nil, 400)

	facets := request(t, app, "GET", parts+"/filters", nil, 200)
	if len(facets["category"].([]any)) != 2 || len(facets["manufacturer"].([]any)) != 1 ||
		facets["temperature_stage"].([]any)[0] != "4" {
		t.Fatalf("unexpected catalog facets: %+v", facets)
	}
	assemblies := request(t, app, "GET", parts+"/filters?has_bom=true", nil, 200)
	if len(assemblies["category"].([]any)) != 1 || len(assemblies["country_of_origin"].([]any)) != 0 {
		t.Fatalf("unexpected assembly facets: %+v", assemblies)
	}
	standalone := request(t, app, "GET", parts+"/filters?unit_type=part", nil, 200)
	if len(standalone["category"].([]any)) != 2 || len(standalone["country_of_origin"].([]any)) != 1 {
		t.Fatalf("unexpected facets for units without a BOM: %+v", standalone)
	}
	serial := request(t, app, "GET", "/api/v1/inventory?search=CABLE-1&category=rf&stock=available", nil, 200)
	if serial["total"] != float64(1) {
		t.Fatalf("catalog filters dropped a matching serial search: %+v", serial)
	}
}

func TestHTTPBuildReplaceAndArchive(t *testing.T) {
	app := realAPI(t)
	part := func(sku string) string {
		return id(t, request(t, app, "POST", "/api/v1/parts", object("sku", sku, "name", sku, "description", "description"), 201))
	}
	parentPart, childPart, otherPart := part("ASSEMBLY"), part("CHILD"), part("OTHER")
	componentPath := "/api/v1/parts/" + parentPart + "/components"
	request(t, app, "POST", componentPath, object("child_part_id", childPart, "slot", "left", "required_quantity", 2, "is_optional", true), 400)
	slot := id(t, request(t, app, "POST", componentPath, object("child_part_id", childPart, "slot", "left", "required_quantity", 2), 201))
	newParent := object("part_id", parentPart, "serial_number", "P-1")
	expectError(t, request(t, app, "POST", "/api/v1/inventory", newParent, 409), "conflict", "need 2, have 0")
	stock := func(p string, n int) []any {
		return request(t, app, "POST", "/api/v1/parts/"+p+"/items", object("count", n), 201)["data"].([]any)
	}
	children, others := stock(childPart, 3), stock(otherPart, 1)
	itemID := func(v any) string { return v.(map[string]any)["id"].(string) }
	parent := id(t, request(t, app, "POST", "/api/v1/inventory", newParent, 201))
	parentPath := "/api/v1/inventory/" + parent
	detail := request(t, app, "GET", parentPath, nil, 200)
	installed := detail["components"].([]any)
	if len(installed) != 2 {
		t.Fatalf("built parent incomplete: %+v", detail)
	}
	first := installed[0].(map[string]any)
	if first["bom_snapshot"].(map[string]any)["child_sku"] != "CHILD" {
		t.Fatalf("missing snapshot: %+v", first)
	}

	// Single installs and removals are gone; the BOM is fixed while items exist
	request(t, app, "POST", parentPath+"/components", object("component_item_id", itemID(children[0]), "part_component_id", slot), 404)
	request(t, app, "DELETE", parentPath+"/components/"+first["id"].(string), nil, 404)
	expectError(t, request(t, app, "PATCH", componentPath+"/"+slot, object("required_quantity", 1), 409), "conflict", "BOM cannot change")
	request(t, app, "PATCH", parentPath, object("assembly_state", "draft"), 400)

	// Replace with the remaining child; wrong SKU and installed items are rejected
	free := request(t, app, "GET", "/api/v1/inventory?available=true&part_id="+childPart, nil, 200)["data"].([]any)
	if len(free) != 1 {
		t.Fatalf("available children: %+v", free)
	}
	replacePath := parentPath + "/components/" + first["id"].(string) + "/replace"
	expectError(t, request(t, app, "POST", replacePath, object("component_item_id", itemID(others[0])), 409), "slot_mismatch", "exact parent and child SKUs")
	expectError(t, request(t, app, "POST", replacePath, object("component_item_id", installed[1].(map[string]any)["component_item_id"]), 409), "duplicate", "active parent")
	if request(t, app, "POST", replacePath, object("component_item_id", itemID(free[0])), 201)["component_item_id"] != itemID(free[0]) {
		t.Fatal("replacement not installed")
	}
	expectError(t, request(t, app, "DELETE", "/api/v1/inventory/"+itemID(free[0]), nil, 409), "constraint_violation", "active use")

	if id(t, request(t, app, "PATCH", parentPath, object("metadata", schema.WithDefaults(object("notes", "kept"))), 200)) != parent {
		t.Fatal("item PATCH did not return updated entity")
	}
	detail = request(t, app, "GET", parentPath, nil, 200)
	if detail["serial_number"] != "P-1" || detail["metadata"].(map[string]any)["notes"] != "kept" {
		t.Fatalf("nullable fields or metadata: %+v", detail)
	}
	if len(detail["components"].([]any)) != 2 || len(detail["history"].([]any)) != 1 {
		t.Fatalf("history/active separation: %+v", detail)
	}
	request(t, app, "PATCH", parentPath, object("metadata", nil), 400)
	expectError(t, request(t, app, "PATCH", parentPath, object("metadata", object("image_url", "x")), 400), "invalid_request", "image_url")
	expectError(t, request(t, app, "PATCH", "/api/v1/parts/"+childPart, object("sku", "RENAMED"), 409), "constraint_violation", "SKU cannot change")
	if id(t, request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("description", nil), 200)) != parentPart {
		t.Fatal("part PATCH did not return updated entity")
	}
	if request(t, app, "GET", "/api/v1/parts/"+parentPart, nil, 200)["description"] != nil {
		t.Fatal("description did not clear")
	}
	tree := request(t, app, "GET", parentPath+"/tree?depth=100", nil, 200)
	if tree["item"].(map[string]any)["id"] != parent || len(tree["children"].([]any)) != 2 {
		t.Fatalf("tree: %+v", tree)
	}
	request(t, app, "GET", parentPath+"/tree?depth=101", nil, 400)

	// Deleting the composite releases its components; it cannot come back
	request(t, app, "DELETE", parentPath, nil, 204)
	if n := request(t, app, "GET", "/api/v1/inventory?available=true&part_id="+childPart, nil, 200)["total"]; n != float64(3) {
		t.Fatalf("released children: %v", n)
	}
	expectError(t, request(t, app, "PATCH", parentPath, object("archived_at", nil), 409), "conflict", "cannot be restored")
	for _, i := range append(children, others...) {
		request(t, app, "DELETE", "/api/v1/inventory/"+itemID(i), nil, 204)
	}
	expectError(t, request(t, app, "DELETE", "/api/v1/parts/"+childPart, nil, 409), "conflict", "is used in the BOM of ASSEMBLY")
	request(t, app, "DELETE", "/api/v1/parts/"+parentPart, nil, 204)
	request(t, app, "DELETE", "/api/v1/parts/"+childPart, nil, 204)
	expectError(t, request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("archived_at", nil), 409), "constraint_violation", "active BOM")
	request(t, app, "PATCH", "/api/v1/parts/"+childPart, object("archived_at", nil), 200)
	request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("archived_at", nil), 200)
	if request(t, app, "GET", "/api/v1/parts/"+parentPart, nil, 200)["archived_at"] != nil {
		t.Fatal("successful restore did not persist")
	}
}
