//go:build integration

package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/hoshina-dev/papi2/internal/apperrors"
	"github.com/hoshina-dev/papi2/internal/database"
	"github.com/hoshina-dev/papi2/internal/models"
	"github.com/hoshina-dev/papi2/internal/repositories"
	"github.com/hoshina-dev/papi2/internal/routes"
	"github.com/hoshina-dev/papi2/internal/services"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
)

func TestInventoryLifecycleAndConcurrentBuilds(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, e := database.Connect(dsn)
	if e != nil {
		t.Fatal(e)
	}
	schema := "svc_" + uuid.New().String()[:8]
	if e = admin.Exec("CREATE SCHEMA " + schema).Error; e != nil {
		t.Fatal(e)
	}
	defer admin.Exec("DROP SCHEMA " + schema + " CASCADE")
	u, e := url.Parse(dsn)
	if e != nil {
		t.Fatal(e)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, e := database.Connect(u.String())
	if e != nil {
		t.Fatal(e)
	}
	pool, _ := db.DB()
	defer pool.Close()
	if e = database.Migrate(ctx, db); e != nil {
		t.Fatal(e)
	}
	s := services.New(repositories.New(db))
	must := func(e error) {
		t.Helper()
		if e != nil {
			t.Fatal(e)
		}
	}
	status := func(e error) int {
		var app *apperrors.Error
		if errors.As(e, &app) {
			return app.Status
		}
		return 0
	}
	parentPart := &models.Part{SKU: " ASSEMBLY ", Name: "Assembly"}
	childPart := &models.Part{SKU: "CHILD", Name: "Child"}
	wrongPart := &models.Part{SKU: "WRONG", Name: "Wrong"}
	for _, p := range []*models.Part{parentPart, childPart, wrongPart} {
		must(s.CreatePart(ctx, p))
	}
	if parentPart.SKU != "ASSEMBLY" {
		t.Fatal("SKU not trimmed")
	}
	slot := &models.PartComponent{ChildPartID: childPart.ID, Slot: " left ", RequiredQuantity: 2}
	must(s.CreateComponent(ctx, parentPart.ID, slot))
	if e = s.CreateComponent(ctx, childPart.ID, &models.PartComponent{ChildPartID: parentPart.ID, Slot: "cycle", RequiredQuantity: 1}); e == nil {
		t.Fatal("BOM cycle accepted")
	}

	// A composite is built from stock, all or nothing
	_, e = s.CreateItems(ctx, childPart.ID, 3, nil)
	must(e)
	if _, e = s.CreateItems(ctx, parentPart.ID, 2, nil); status(e) != 409 || !strings.Contains(e.Error(), "need 4, have 3") {
		t.Fatalf("short stock: %v", e)
	}
	if page, _ := s.Items(ctx, models.Filter{PartID: &parentPart.ID, Limit: 1}); page.Total != 0 {
		t.Fatal("failed build left items behind")
	}
	parent := &models.InventoryItem{PartID: parentPart.ID}
	must(s.CreateItem(ctx, parent))
	detail, e := s.Item(ctx, parent.ID)
	must(e)
	if len(detail.Components) != 2 || detail.Components[0].BOMSnapshot["child_sku"] != "CHILD" || detail.Components[0].BOMSnapshot["parent_sku"] != "ASSEMBLY" {
		t.Fatalf("built item incomplete: %+v", detail.Components)
	}

	// Two builds race for the last two children: exactly one wins
	_, e = s.CreateItems(ctx, childPart.ID, 1, nil)
	must(e)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for j := range errs {
		wg.Add(1)
		go func(j int) {
			defer wg.Done()
			errs[j] = s.CreateItem(ctx, &models.InventoryItem{PartID: parentPart.ID})
		}(j)
	}
	wg.Wait()
	if (errs[0] == nil) == (errs[1] == nil) || status(errs[0])+status(errs[1]) != 409 {
		t.Fatalf("concurrent builds: %v", errs)
	}
	built, _ := s.Items(ctx, models.Filter{PartID: &parentPart.ID, Limit: 10})
	if built.Total != 2 {
		t.Fatalf("composites %d", built.Total)
	}

	// The BOM is fixed while items exist
	if e = patchComponent(s.UpdateComponent)(ctx, parentPart.ID, slot.ID, map[string]any{"required_quantity": float64(3)}); status(e) != 409 {
		t.Fatalf("BOM edit with items: %v", e)
	}
	if e = s.CreateComponent(ctx, parentPart.ID, &models.PartComponent{ChildPartID: wrongPart.ID, Slot: "extra", RequiredQuantity: 1}); status(e) != 409 {
		t.Fatalf("BOM add with items: %v", e)
	}
	for _, op := range []func() error{func() error {
		return patchComponent(s.UpdateComponent)(ctx, wrongPart.ID, slot.ID, map[string]any{"slot": "x"})
	}, func() error { return s.DeleteComponent(ctx, wrongPart.ID, slot.ID) }} {
		if e = op(); status(e) != 404 {
			t.Fatalf("wrong-parent component mutation: %v", e)
		}
	}

	// Replace swaps one component for an available unit of the same SKU
	installed := detail.Components[0]
	spare := &models.InventoryItem{PartID: childPart.ID}
	wrong := &models.InventoryItem{PartID: wrongPart.ID}
	must(s.CreateItem(ctx, spare))
	must(s.CreateItem(ctx, wrong))
	if _, e = s.Replace(ctx, parent.ID, installed.ID, wrong.ID); status(e) != 409 {
		t.Fatalf("wrong SKU replacement: %v", e)
	}
	if _, e = s.Replace(ctx, parent.ID, installed.ID, detail.Components[1].ComponentItemID); status(e) != 409 {
		t.Fatalf("replacement with an installed item: %v", e)
	}
	if _, e = s.Replace(ctx, wrong.ID, installed.ID, spare.ID); status(e) != 404 {
		t.Fatalf("replacement through the wrong parent: %v", e)
	}
	next, e := s.Replace(ctx, parent.ID, installed.ID, spare.ID)
	must(e)
	if next.ComponentItemID != spare.ID {
		t.Fatal("replacement not installed")
	}
	detail, e = s.Item(ctx, parent.ID)
	must(e)
	if len(detail.Components) != 2 || len(detail.History) != 1 || detail.History[0].ComponentItemID != installed.ComponentItemID {
		t.Fatalf("replacement history: %+v", detail)
	}
	if free, _ := s.Items(ctx, models.Filter{PartID: &childPart.ID, Available: true, Limit: 10}); free.Total != 1 || free.Data[0].ID != installed.ComponentItemID {
		t.Fatalf("replaced item not back in stock: %+v", free.Data)
	}
	// Lists and details name the active parent only, not ones in history
	children, e := s.Items(ctx, models.Filter{PartID: &childPart.ID, Limit: 10})
	must(e)
	for _, child := range children.Data {
		installedIn := child.Parent != nil && child.Parent.ParentItem != nil && child.Parent.ParentItem.Part != nil
		if (child.ID == installed.ComponentItemID) == installedIn {
			t.Fatalf("list parent of %s: %+v", child.ID, child.Parent)
		}
	}
	if item, e := s.Item(ctx, spare.ID); e != nil || item.Parent == nil || item.Parent.ParentItemID != parent.ID {
		t.Fatalf("detail parent: %+v %v", item, e)
	}
	if detail, e := s.Part(ctx, childPart.ID); e != nil || *detail.Stock != (models.Stock{Total: 5, InUse: 4, Available: 1}) {
		t.Fatalf("stock: %+v %v", detail.Stock, e)
	}
	if page, e := s.Parts(ctx, models.Filter{Search: "CHILD", Limit: 10}); e != nil || page.Data[0].Stock == nil {
		t.Fatalf("list stock: %+v %v", page, e)
	}

	tree, e := s.Tree(ctx, parent.ID, 1)
	if e != nil || tree.Item.Part == nil || len(tree.Children) != 2 || tree.Children[0].Item.Part == nil {
		t.Fatalf("tree content incorrect: %+v %v", tree, e)
	}
	if tree, e = s.Tree(ctx, parent.ID, 0); e != nil || !tree.Truncated || len(tree.Children) != 0 {
		t.Fatalf("depth bound failed: %+v %v", tree, e)
	}
	if e = s.ArchiveItem(ctx, spare.ID); status(e) != 409 {
		t.Fatalf("installed item archived: %v", e)
	}
	must(patch(s.UpdateItem)(ctx, parent.ID, map[string]any{"metadata": map[string]any{"category": nil, "manufacturer": nil, "country_of_origin": nil, "notes": "checked", "temperature_stage": nil, "image_urls": nil, "specification": map[string]any{}}}))
	detail, e = s.Item(ctx, parent.ID)
	if e != nil || detail.Metadata["notes"] != "checked" {
		t.Fatalf("patch incorrect: %+v %v", detail, e)
	}

	// Deleting a composite returns its components to stock
	must(s.ArchiveItem(ctx, parent.ID))
	if free, _ := s.Items(ctx, models.Filter{PartID: &childPart.ID, Available: true, Limit: 10}); free.Total != 3 {
		t.Fatalf("components not released: %d", free.Total)
	}
	if e = patch(s.UpdateItem)(ctx, parent.ID, map[string]any{"archived_at": nil}); status(e) != 409 {
		t.Fatalf("deleted composite restored: %v", e)
	}
	must(s.ArchiveItem(ctx, wrong.ID))
	must(patch(s.UpdateItem)(ctx, wrong.ID, map[string]any{"archived_at": nil}))
	if e = s.DeleteComponent(ctx, parentPart.ID, slot.ID); e == nil {
		t.Fatal("BOM row with installation history deleted")
	}
	if e = patch(s.UpdatePart)(ctx, parentPart.ID, map[string]any{"sku": "renamed"}); e == nil {
		t.Fatal("in-use SKU edit accepted")
	}
	if e = s.ArchivePart(ctx, childPart.ID); e == nil {
		t.Fatal("part with active inventory archived")
	}

	archiveParent := &models.Part{SKU: "ARCHIVE-PARENT", Name: "Archive"}
	archiveChild := &models.Part{SKU: "ARCHIVE-CHILD", Name: "Child"}
	for _, p := range []*models.Part{archiveParent, archiveChild} {
		must(s.CreatePart(ctx, p))
	}
	must(s.CreateComponent(ctx, archiveParent.ID, &models.PartComponent{ChildPartID: archiveChild.ID, Slot: "child", RequiredQuantity: 1}))
	if e = s.ArchivePart(ctx, archiveChild.ID); e == nil {
		t.Fatal("active BOM child archived")
	}
	must(s.ArchivePart(ctx, archiveParent.ID))
	must(s.ArchivePart(ctx, archiveChild.ID))
	if e = patch(s.UpdatePart)(ctx, archiveParent.ID, map[string]any{"archived_at": nil}); e == nil {
		t.Fatal("restored parent with archived BOM child")
	}
	must(patch(s.UpdatePart)(ctx, archiveChild.ID, map[string]any{"archived_at": nil}))
	must(patch(s.UpdatePart)(ctx, archiveParent.ID, map[string]any{"archived_at": nil}))
	for _, sku := range []string{"literal%sku", "literal_sku"} {
		must(s.CreatePart(ctx, &models.Part{SKU: sku, Name: "Literal"}))
	}
	for _, search := range []string{"%", "_"} {
		page, e := s.Parts(ctx, models.Filter{Search: search, Limit: 1})
		if e != nil || page.Total != 1 || len(page.Data) != 1 {
			t.Fatalf("literal search failed %+v %v", page, e)
		}
		page, e = s.Parts(ctx, models.Filter{Search: search, Limit: 1, Offset: 1})
		if e != nil || page.Total != 1 || len(page.Data) != 0 {
			t.Fatalf("list pagination failed %+v %v", page, e)
		}
	}
	literal := &models.Part{SKU: "LITERAL-ITEMS", Name: "Literal items"}
	must(s.CreatePart(ctx, literal))
	must(s.CreateItem(ctx, &models.InventoryItem{PartID: literal.ID, SerialNumber: ptr("serial%1")}))
	must(s.CreateItem(ctx, &models.InventoryItem{PartID: literal.ID, SerialNumber: ptr("serial_1")}))
	if items, e := s.Items(ctx, models.Filter{Search: "l%1", Limit: 10}); e != nil || items.Total != 1 || *items.Data[0].SerialNumber != "serial%1" {
		t.Fatalf("literal item search failed %+v %v", items, e)
	}
	if sum, e := s.Summary(ctx); e != nil || sum.Items == 0 || sum.Parts == 0 || sum.RootItems+sum.InstalledItems != sum.Items {
		t.Fatalf("summary incorrect: %+v %v", sum, e)
	}
	app := routes.NewApp(s, func(context.Context) error { return nil })
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{{"GET", "/api/v1/parts?limit=1&offset=1", "", 200}, {"GET", "/api/v1/inventory/" + parent.ID.String(), "", 200}, {"PATCH", "/api/v1/inventory/" + wrong.ID.String(), `{"metadata":{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":9007199254740993,"image_urls":null,"specification":{}}}`, 200}, {"POST", "/api/v1/inventory", `{"part_id":"` + uuid.New().String() + `"}`, 404}} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		res, e := app.Test(req, 10000)
		if e != nil {
			t.Fatal(e)
		}
		if res.StatusCode != tc.status {
			var output any
			_ = json.NewDecoder(res.Body).Decode(&output)
			res.Body.Close()
			t.Fatalf("HTTP %s %s status%d want%d: %v", tc.method, tc.path, res.StatusCode, tc.status, output)
		}
		res.Body.Close()
	}
}

func TestPartParentUsages(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, e := database.Connect(dsn)
	if e != nil {
		t.Fatal(e)
	}
	adminPool, _ := admin.DB()
	defer adminPool.Close()
	schema := "parents_" + uuid.New().String()[:8]
	if e = admin.Exec("CREATE SCHEMA " + schema).Error; e != nil {
		t.Fatal(e)
	}
	defer admin.Exec("DROP SCHEMA " + schema + " CASCADE")
	u, e := url.Parse(dsn)
	if e != nil {
		t.Fatal(e)
	}
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	db, e := database.Connect(u.String())
	if e != nil {
		t.Fatal(e)
	}
	pool, _ := db.DB()
	defer pool.Close()
	if e = database.Migrate(ctx, db); e != nil {
		t.Fatal(e)
	}
	s := services.New(repositories.New(db))
	child := &models.Part{SKU: "LEAF", Name: "Leaf"}
	parentA := &models.Part{SKU: "PARENT-A", Name: "First assembly"}
	parentB := &models.Part{SKU: "PARENT-B", Name: "Second assembly"}
	orphan := &models.Part{SKU: "ORPHAN", Name: "Standalone"}
	for _, part := range []*models.Part{child, parentA, parentB, orphan} {
		if e = s.CreatePart(ctx, part); e != nil {
			t.Fatal(e)
		}
	}
	empty, e := s.Part(ctx, orphan.ID)
	if e != nil {
		t.Fatal(e)
	}
	if empty.Parents == nil || len(empty.Parents) != 0 {
		t.Fatalf("empty parents must be []: %+v", empty.Parents)
	}
	serialized, e := json.Marshal(empty)
	if e != nil || !strings.Contains(string(serialized), `"parents":[]`) {
		t.Fatalf("empty HTTP contract: %s %v", serialized, e)
	}
	injectedID := uuid.New()
	edges := []*models.PartComponent{{ChildPartID: child.ID, Slot: "a", RequiredQuantity: 2, ParentPart: &models.Part{ID: injectedID, SKU: "INJECTED", Name: "Unexpected parent"}}, {ChildPartID: child.ID, Slot: "b", RequiredQuantity: 1}, {ChildPartID: child.ID, Slot: "c", RequiredQuantity: 4}}
	for j, edge := range edges {
		parent := parentA.ID
		if j == 2 {
			parent = parentB.ID
		}
		if e = s.CreateComponent(ctx, parent, edge); e != nil {
			t.Fatal(e)
		}
	}
	if _, e = s.Part(ctx, injectedID); e == nil {
		t.Fatal("nested parent association was written")
	}
	if e = s.ArchivePart(ctx, parentA.ID); e != nil {
		t.Fatal(e)
	}
	detail, e := s.Part(ctx, child.ID)
	if e != nil {
		t.Fatal(e)
	}
	if len(detail.Parents) != 3 {
		t.Fatalf("missing usages: %+v", detail.Parents)
	}
	for j, edge := range detail.Parents {
		if edge.ID != edges[j].ID || edge.ChildPartID != child.ID || edge.ParentPart == nil || edge.ParentPart.ID != edge.ParentPartID || edge.RequiredQuantity != edges[j].RequiredQuantity {
			t.Fatalf("incorrect reverse edge: %+v", edge)
		}
		if j < 2 && (edge.ParentPart.ID != parentA.ID || edge.ParentPart.ArchivedAt == nil) {
			t.Fatalf("archived parent lost: %+v", edge.ParentPart)
		}
		if j == 2 && (edge.ParentPart.ID != parentB.ID || edge.ParentPart.ArchivedAt != nil) {
			t.Fatalf("active parent incorrect: %+v", edge.ParentPart)
		}
	}
	app := routes.NewApp(s, func(context.Context) error { return nil })
	res, e := app.Test(httptest.NewRequest("GET", "/api/v1/parts/"+child.ID.String(), nil))
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	var response models.PartDetail
	if e = json.NewDecoder(res.Body).Decode(&response); e != nil {
		t.Fatal(e)
	}
	if res.StatusCode != 200 || len(response.Parents) != 3 || response.Parents[0].ParentPart == nil || response.Parents[0].ParentPart.ArchivedAt == nil {
		t.Fatalf("HTTP parent usages missing: status%d %+v", res.StatusCode, response.Parents)
	}
}

func TestGeneratedSKUAndItemBatch(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, e := database.Connect(dsn)
	if e != nil {
		t.Fatal(e)
	}
	adminPool, _ := admin.DB()
	defer adminPool.Close()
	schema := "batch_" + uuid.New().String()[:8]
	if e = admin.Exec("CREATE SCHEMA " + schema).Error; e != nil {
		t.Fatal(e)
	}
	defer admin.Exec("DROP SCHEMA " + schema + " CASCADE")
	u, e := url.Parse(dsn)
	if e != nil {
		t.Fatal(e)
	}
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	db, e := database.Connect(u.String())
	if e != nil {
		t.Fatal(e)
	}
	pool, _ := db.DB()
	defer pool.Close()
	if e = database.Migrate(ctx, db); e != nil {
		t.Fatal(e)
	}
	s := services.New(repositories.New(db))

	part := &models.Part{Name: "Generated", Metadata: models.JSONMap{"notes": "inherited"}}
	if e = s.CreatePart(ctx, part); e != nil {
		t.Fatal(e)
	}
	if !regexp.MustCompile(`^RF-[0-9A-F]{8}$`).MatchString(part.SKU) {
		t.Fatalf("generated SKU %q", part.SKU)
	}
	for _, count := range []int{0, services.MaxNewItems + 1} {
		if _, e = s.CreateItems(ctx, part.ID, count, nil); e == nil {
			t.Fatalf("count %d accepted", count)
		}
	}
	if _, e = s.CreateItems(ctx, uuid.New(), 1, nil); e == nil {
		t.Fatal("items created for a missing part")
	}
	items, e := s.CreateItems(ctx, part.ID, 3, nil)
	if e != nil || len(items) != 3 {
		t.Fatalf("batch: %v %d", e, len(items))
	}
	page, e := s.Items(ctx, models.Filter{PartID: &part.ID, Limit: 10})
	if e != nil || page.Total != 3 {
		t.Fatalf("stored items: %v %d", e, page.Total)
	}
	serials := map[string]bool{}
	for _, item := range page.Data {
		if item.SerialNumber == nil || !regexp.MustCompile(`^RF-SN-\d{12}$`).MatchString(*item.SerialNumber) || item.Metadata["notes"] != "inherited" {
			t.Fatalf("item not generated from part: %+v", item)
		}
		serials[*item.SerialNumber] = true
	}
	if len(serials) != 3 {
		t.Fatal("serial numbers repeated")
	}
}

func TestPartSortOrders(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, e := database.Connect(dsn)
	if e != nil {
		t.Fatal(e)
	}
	adminPool, _ := admin.DB()
	defer adminPool.Close()
	schema := "sort_" + uuid.New().String()[:8]
	if e = admin.Exec("CREATE SCHEMA " + schema).Error; e != nil {
		t.Fatal(e)
	}
	defer admin.Exec("DROP SCHEMA " + schema + " CASCADE")
	u, e := url.Parse(dsn)
	if e != nil {
		t.Fatal(e)
	}
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	db, e := database.Connect(u.String())
	if e != nil {
		t.Fatal(e)
	}
	pool, _ := db.DB()
	defer pool.Close()
	if e = database.Migrate(ctx, db); e != nil {
		t.Fatal(e)
	}
	s := services.New(repositories.New(db))
	parts := map[string]*models.Part{}
	for _, name := range []string{"bolt", "Axle", "cable"} {
		parts[name] = &models.Part{Name: name}
		if e = s.CreatePart(ctx, parts[name]); e != nil {
			t.Fatal(e)
		}
	}
	// cable has 3 items, all installed in an Axle; bolt has 2 loose items
	if e = s.CreateComponent(ctx, parts["Axle"].ID, &models.PartComponent{ChildPartID: parts["cable"].ID, Slot: "cable", RequiredQuantity: 3}); e != nil {
		t.Fatal(e)
	}
	for _, stock := range []struct {
		name  string
		count int
	}{{"cable", 3}, {"bolt", 2}, {"Axle", 1}} {
		if _, e = s.CreateItems(ctx, parts[stock.name].ID, stock.count, nil); e != nil {
			t.Fatal(e)
		}
	}
	for sort, want := range map[string]string{"name": "Axle bolt cable", "items": "cable bolt Axle", "available_items": "bolt Axle cable", "": "cable Axle bolt"} {
		page, e := s.Parts(ctx, models.Filter{Sort: sort, Limit: 10})
		if e != nil {
			t.Fatal(e)
		}
		names := make([]string, len(page.Data))
		for i, p := range page.Data {
			names[i] = p.Name
		}
		if got := strings.Join(names, " "); got != want {
			t.Errorf("sort %q: got %q, want %q", sort, got, want)
		}
	}
}

// patch drops the updated row so error-only call sites stay short
func patch[T any](update func(context.Context, uuid.UUID, map[string]any) (T, error)) func(context.Context, uuid.UUID, map[string]any) error {
	return func(ctx context.Context, id uuid.UUID, p map[string]any) error {
		_, e := update(ctx, id, p)
		return e
	}
}
func patchComponent(update func(context.Context, uuid.UUID, uuid.UUID, map[string]any) (*models.PartComponent, error)) func(context.Context, uuid.UUID, uuid.UUID, map[string]any) error {
	return func(ctx context.Context, parent, id uuid.UUID, p map[string]any) error {
		_, e := update(ctx, parent, id, p)
		return e
	}
}

func TestArchivePartTakesItsItems(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, e := database.Connect(dsn)
	if e != nil {
		t.Fatal(e)
	}
	adminPool, _ := admin.DB()
	defer adminPool.Close()
	schema := "archive_" + uuid.New().String()[:8]
	if e = admin.Exec("CREATE SCHEMA " + schema).Error; e != nil {
		t.Fatal(e)
	}
	defer admin.Exec("DROP SCHEMA " + schema + " CASCADE")
	u, e := url.Parse(dsn)
	if e != nil {
		t.Fatal(e)
	}
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	db, e := database.Connect(u.String())
	if e != nil {
		t.Fatal(e)
	}
	pool, _ := db.DB()
	defer pool.Close()
	if e = database.Migrate(ctx, db); e != nil {
		t.Fatal(e)
	}
	s := services.New(repositories.New(db))
	must := func(e error) {
		t.Helper()
		if e != nil {
			t.Fatal(e)
		}
	}
	count := func(p *models.Part, available bool) int64 {
		t.Helper()
		page, e := s.Items(ctx, models.Filter{PartID: &p.ID, Available: available, Limit: 1})
		must(e)
		return page.Total
	}
	box, leg := &models.Part{Name: "Box"}, &models.Part{Name: "Leg"}
	must(s.CreatePart(ctx, box))
	must(s.CreatePart(ctx, leg))
	must(s.CreateComponent(ctx, box.ID, &models.PartComponent{ChildPartID: leg.ID, Slot: "leg", RequiredQuantity: 2}))
	_, e = s.CreateItems(ctx, leg.ID, 5, nil)
	must(e)
	_, e = s.CreateItems(ctx, box.ID, 2, nil)
	must(e)

	// Leg units sit inside boxes and Leg is in Box's BOM: nothing changes
	if e = s.ArchivePart(ctx, leg.ID); e == nil || e.Error() != "Leg is used in the BOM of Box; remove it there first" {
		t.Fatalf("part with installed items: %v", e)
	}
	if count(leg, false) != 5 || count(box, false) != 2 {
		t.Fatal("rejected delete archived items")
	}

	// Deleting Box takes its items and returns their legs to stock
	must(s.ArchivePart(ctx, box.ID))
	if count(box, false) != 0 || count(leg, true) != 5 {
		t.Fatalf("boxes %d, free legs %d", count(box, false), count(leg, true))
	}
}

func ptr[T any](v T) *T { return &v }
