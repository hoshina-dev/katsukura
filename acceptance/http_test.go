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

func TestHTTPReferencedBOMAndNullablePatch(t *testing.T) {
	app := realAPI(t)
	part := func(sku string) string {
		return id(t, request(t, app, "POST", "/api/v1/parts", object("sku", sku, "name", sku, "description", "description"), 201))
	}
	parentPart, childPart, otherPart := part("ASSEMBLY"), part("CHILD"), part("OTHER")
	componentPath := "/api/v1/parts/" + parentPart + "/components"
	slot := id(t, request(t, app, "POST", componentPath, object("child_part_id", childPart, "slot", "left", "required_quantity", 2, "is_optional", true), 201))
	item := func(p string) string {
		return id(t, request(t, app, "POST", "/api/v1/inventory", object("part_id", p, "assembly_state", "complete", "location", "Shelf", "serial_number", uuid.NewString()), 201))
	}
	parent, child, second, wrong := item(parentPart), item(childPart), item(childPart), item(otherPart)
	parentPath := "/api/v1/inventory/" + parent
	install := func(c string) string {
		return id(t, request(t, app, "POST", parentPath+"/components", object("component_item_id", c, "part_component_id", slot), 201))
	}
	expectError(t, request(t, app, "POST", parentPath+"/components", object("component_item_id", wrong, "part_component_id", slot), 409), "slot_mismatch", "")
	firstInstall, secondInstall := install(child), install(second)
	slotPath := componentPath + "/" + slot
	expectError(t, request(t, app, "PATCH", slotPath, object("required_quantity", 1), 409), "constraint_violation", "quantity")
	current := request(t, app, "GET", componentPath, nil, 200)["data"].([]any)[0].(map[string]any)
	if current["required_quantity"] != float64(2) {
		t.Fatalf("failed quantity edit persisted: %+v", current)
	}
	request(t, app, "DELETE", parentPath+"/components/"+secondInstall, nil, 204)
	if id(t, request(t, app, "PATCH", slotPath, object("required_quantity", 1, "is_optional", false), 200)) != slot {
		t.Fatal("component PATCH did not return updated entity")
	}
	expectError(t, request(t, app, "DELETE", "/api/v1/inventory/"+child, nil, 409), "constraint_violation", "active use")
	request(t, app, "DELETE", parentPath+"/components/"+firstInstall, nil, 204)
	expectError(t, request(t, app, "PATCH", slotPath, object("child_part_id", otherPart), 409), "referenced_resource", "")
	current = request(t, app, "GET", componentPath, nil, 200)["data"].([]any)[0].(map[string]any)
	if current["child_part_id"] != childPart {
		t.Fatal("rejected historic child edit persisted")
	}
	expectError(t, request(t, app, "DELETE", slotPath, nil, 409), "referenced_resource", "")
	extraParent := item(parentPart)
	request(t, app, "DELETE", "/api/v1/inventory/"+extraParent, nil, 204)
	if request(t, app, "PATCH", parentPath, object("assembly_state", "draft"), 200)["assembly_state"] != "draft" {
		t.Fatal("draft transition did not persist")
	}
	request(t, app, "PATCH", parentPath, object("assembly_state", "complete"), 200)
	if id(t, request(t, app, "PATCH", parentPath, object("location", nil, "serial_number", nil, "metadata", object("notes", "kept")), 200)) != parent {
		t.Fatal("item PATCH did not return updated entity")
	}
	detail := request(t, app, "GET", parentPath, nil, 200)
	if detail["location"] != nil || detail["serial_number"] != nil {
		t.Fatalf("nullable fields did not clear: %+v", detail)
	}
	if len(detail["history"].([]any)) != 2 || len(detail["components"].([]any)) != 0 {
		t.Fatalf("history/active separation: %+v", detail)
	}
	if detail["assembly_state"] != "complete" || detail["metadata"].(map[string]any)["notes"] != "kept" {
		t.Fatalf("complete item with missing required children or metadata changed: %+v", detail)
	}
	for _, entry := range detail["history"].([]any) {
		snapshot := entry.(map[string]any)["bom_snapshot"].(map[string]any)
		if snapshot["required_quantity"] != float64(2) || snapshot["child_sku"] != "CHILD" {
			t.Fatalf("historical snapshot changed with BOM edits: %+v", snapshot)
		}
	}
	expectError(t, request(t, app, "PATCH", "/api/v1/parts/"+childPart, object("sku", "RENAMED"), 409), "constraint_violation", "SKU cannot change")
	request(t, app, "PATCH", parentPath, object("metadata", nil), 400)
	expectError(t, request(t, app, "PATCH", parentPath, object("metadata", object("image_url", "x")), 400), "invalid_request", "image_url")
	if id(t, request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("description", nil), 200)) != parentPart {
		t.Fatal("part PATCH did not return updated entity")
	}
	if request(t, app, "GET", "/api/v1/parts/"+parentPart, nil, 200)["description"] != nil {
		t.Fatal("description did not clear")
	}
	for _, i := range []string{parent, child, second} {
		request(t, app, "DELETE", "/api/v1/inventory/"+i, nil, 204)
	}
	expectError(t, request(t, app, "DELETE", "/api/v1/parts/"+otherPart, nil, 409), "constraint_violation", "active use")
	expectError(t, request(t, app, "DELETE", "/api/v1/parts/"+childPart, nil, 409), "constraint_violation", "active BOM")
	request(t, app, "DELETE", "/api/v1/parts/"+parentPart, nil, 204)
	request(t, app, "DELETE", "/api/v1/parts/"+childPart, nil, 204)
	expectError(t, request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("archived_at", nil), 409), "constraint_violation", "active BOM")
	expectError(t, request(t, app, "PATCH", parentPath, object("archived_at", nil), 409), "constraint_violation", "active use")
	if request(t, app, "GET", parentPath, nil, 200)["archived_at"] == nil || request(t, app, "GET", "/api/v1/parts/"+parentPart, nil, 200)["archived_at"] == nil {
		t.Fatal("rejected restores persisted")
	}
	request(t, app, "PATCH", "/api/v1/parts/"+childPart, object("archived_at", nil), 200)
	request(t, app, "PATCH", "/api/v1/parts/"+parentPart, object("archived_at", nil), 200)
	request(t, app, "PATCH", parentPath, object("archived_at", nil), 200)
	if request(t, app, "GET", parentPath, nil, 200)["archived_at"] != nil || request(t, app, "GET", "/api/v1/parts/"+parentPart, nil, 200)["archived_at"] != nil {
		t.Fatal("successful restores did not persist")
	}
	tree := request(t, app, "GET", parentPath+"/tree?depth=100", nil, 200)
	if tree["item"].(map[string]any)["id"] != parent {
		t.Fatal("tree returned incorrect item")
	}
	request(t, app, "GET", parentPath+"/tree?depth=101", nil, 400)
}
