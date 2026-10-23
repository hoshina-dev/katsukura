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
	"github.com/hoshina-dev/papi2/internal/database"
	"github.com/hoshina-dev/papi2/internal/repositories"
	"github.com/hoshina-dev/papi2/internal/routes"
	"github.com/hoshina-dev/papi2/internal/services"
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

func TestHTTPBuildReplaceAndArchive(t *testing.T) {
	app := realAPI(t)
	part := func(sku string) string {
		return id(t, request(t, app, "POST", "/api/v1/parts", object("sku", sku, "name", sku, "description", "description"), 201))
	}
	parentPart, childPart, otherPart := part("ASSEMBLY"), part("CHILD"), part("OTHER")
	componentPath := "/api/v1/parts/" + parentPart + "/components"
	request(t, app, "POST", componentPath, object("child_part_id", childPart, "slot", "left", "required_quantity", 2, "is_optional", true), 400)
	slot := id(t, request(t, app, "POST", componentPath, object("child_part_id", childPart, "slot", "left", "required_quantity", 2), 201))
	newParent := object("part_id", parentPart, "location", "Shelf", "serial_number", "P-1")
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

	if id(t, request(t, app, "PATCH", parentPath, object("location", nil, "serial_number", nil, "metadata", object("notes", "kept")), 200)) != parent {
		t.Fatal("item PATCH did not return updated entity")
	}
	detail = request(t, app, "GET", parentPath, nil, 200)
	if detail["location"] != nil || detail["serial_number"] != nil || detail["metadata"].(map[string]any)["notes"] != "kept" {
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
	expectError(t, request(t, app, "DELETE", "/api/v1/parts/"+childPart, nil, 409), "constraint_violation", "active BOM")
	request(t, app, "DELETE", "/api/v1/parts/"+parentPart, nil, 204)
	request(t, app, "DELETE", "/api/v1/parts/"+childPart, nil, 204)
	expectError(t, request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("archived_at", nil), 409), "constraint_violation", "active BOM")
	request(t, app, "PATCH", "/api/v1/parts/"+childPart, object("archived_at", nil), 200)
	request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("archived_at", nil), 200)
	if request(t, app, "GET", "/api/v1/parts/"+parentPart, nil, 200)["archived_at"] != nil {
		t.Fatal("successful restore did not persist")
	}
}
