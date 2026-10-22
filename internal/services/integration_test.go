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
	"strings"
	"sync"
	"testing"
)

func TestInventoryLifecycleAndConcurrentQuantity(t *testing.T) {
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
	parentPart := &models.Part{SKU: " ASSEMBLY ", Name: "Assembly"}
	childPart := &models.Part{SKU: "CHILD", Name: "Child"}
	wrongPart := &models.Part{SKU: "WRONG", Name: "Wrong"}
	for _, p := range []*models.Part{parentPart, childPart, wrongPart} {
		if e = s.CreatePart(ctx, p); e != nil {
			t.Fatal(e)
		}
	}
	if parentPart.SKU != "ASSEMBLY" {
		t.Fatal("SKU not trimmed")
	}
	slot := &models.PartComponent{ChildPartID: childPart.ID, Slot: " left ", RequiredQuantity: 1}
	if e = s.CreateComponent(ctx, parentPart.ID, slot); e != nil {
		t.Fatal(e)
	}
	parent := &models.InventoryItem{PartID: parentPart.ID, AssemblyState: "complete"}
	children := []*models.InventoryItem{{PartID: childPart.ID}, {PartID: childPart.ID}, {PartID: wrongPart.ID}}

	for _, i := range children {
		if e = s.CreateItem(ctx, i); e != nil {
			t.Fatal(e)
		}
	}
	if e = s.CreateItem(ctx, parent); e != nil {
		t.Fatal("complete item with missing components rejected:", e)
	}
	if e = s.Install(ctx, parent.ID, &models.ItemComponent{ComponentItemID: children[2].ID, PartComponentID: slot.ID}); e == nil {
		t.Fatal("wrong SKU accepted")
	}
	installs := []*models.ItemComponent{{ComponentItemID: children[0].ID, PartComponentID: slot.ID}, {ComponentItemID: children[1].ID, PartComponentID: slot.ID}}
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for j := range installs {
		wg.Add(1)
		go func(j int) { defer wg.Done(); errs[j] = s.Install(ctx, parent.ID, installs[j]) }(j)
	}
	wg.Wait()
	winner := -1
	for j, e := range errs {
		if e == nil {
			if winner != -1 {
				t.Fatal("quantity race accepted both")
			}
			winner = j
		} else {
			var app *apperrors.Error
			if !errors.As(e, &app) || app.Status != 409 {
				t.Fatalf("constraint not translated: %v", e)
			}
		}
	}
	if winner < 0 {
		t.Fatal("both installs failed", errs)
	}
	installed := installs[winner]
	if installed.BOMSnapshot["child_sku"] != "CHILD" || installed.BOMSnapshot["parent_sku"] != "ASSEMBLY" {
		t.Fatalf("missing snapshot: %v", installed.BOMSnapshot)
	}
	treeFull, treeErr := s.Tree(ctx, parent.ID, 1)
	if treeErr != nil || treeFull.Item.ID != parent.ID || treeFull.Item.Part == nil || len(treeFull.Children) != 1 || treeFull.Children[0].Item.ID != installed.ComponentItemID || treeFull.Children[0].Item.Part == nil {
		t.Fatalf("tree content incorrect: %+v %v", treeFull, treeErr)
	}
	if e = s.ArchiveItem(ctx, parent.ID); e == nil {
		t.Fatal("parent archive with active children accepted")
	}
	if e = s.DeleteComponent(ctx, parentPart.ID, slot.ID); e == nil {
		t.Fatal("historical component deletion accepted")
	}
	tree, e := s.Tree(ctx, parent.ID, 0)
	if e != nil || !tree.Truncated || len(tree.Children) != 0 {
		t.Fatalf("depth bound failed: %+v %v", tree, e)
	}
	if e = s.Remove(ctx, children[2].ID, installed.ID); e == nil {
		t.Fatal("wrong-parent removal accepted")
	}
	if e = s.Remove(ctx, parent.ID, installed.ID); e != nil {
		t.Fatal(e)
	}
	if e = s.Remove(ctx, parent.ID, installed.ID); e != nil {
		t.Fatal("idempotent removal:", e)
	}
	detail, e := s.Item(ctx, parent.ID)
	if e != nil || len(detail.Components) != 0 || len(detail.History) != 1 || detail.History[0].RemovedAt == nil {
		t.Fatalf("history incorrect: %+v %v", detail, e)
	}
	if e = s.PatchItem(ctx, parent.ID, map[string]any{"location": " Shelf ", "metadata": map[string]any{"checked": true}}); e != nil {
		t.Fatal(e)
	}
	if e = s.PatchItem(ctx, parent.ID, map[string]any{"location": nil}); e != nil {
		t.Fatal(e)
	}
	if e = s.ArchiveItem(ctx, parent.ID); e != nil {
		t.Fatal(e)
	}
	if e = s.PatchItem(ctx, parent.ID, map[string]any{"archived_at": nil}); e != nil {
		t.Fatal(e)
	}
	detail, e = s.Item(ctx, parent.ID)
	if e != nil || detail.ArchivedAt != nil || detail.Location != nil || detail.Metadata["checked"] != true {
		t.Fatalf("patch/restore incorrect: %+v %v", detail, e)
	}
	if e = s.DeleteComponent(ctx, parentPart.ID, slot.ID); e == nil {
		t.Fatal("removed history deletion accepted")
	}
	if e = s.CreateComponent(ctx, childPart.ID, &models.PartComponent{ChildPartID: parentPart.ID, Slot: "cycle", RequiredQuantity: 1}); e == nil {
		t.Fatal("BOM cycle accepted")
	}
	if e = s.PatchPart(ctx, parentPart.ID, map[string]any{"sku": "renamed"}); e == nil {
		t.Fatal("in-use SKU edit accepted")
	}
	for _, op := range []func() error{func() error { return s.PatchComponent(ctx, wrongPart.ID, slot.ID, map[string]any{"is_optional": true}) }, func() error { return s.DeleteComponent(ctx, wrongPart.ID, slot.ID) }} {
		e = op()
		var a *apperrors.Error
		if !errors.As(e, &a) || a.Status != 404 {
			t.Fatalf("wrong-parent component mutation: %v", e)
		}
	}
	if e = s.PatchComponent(ctx, parentPart.ID, slot.ID, map[string]any{"required_quantity": float64(2)}); e != nil {
		t.Fatal(e)
	}
	freshInstalls := []*models.ItemComponent{{ComponentItemID: children[0].ID, PartComponentID: slot.ID}, {ComponentItemID: children[1].ID, PartComponentID: slot.ID}}
	for _, v := range freshInstalls {
		if e = s.Install(ctx, parent.ID, v); e != nil {
			t.Fatal(e)
		}
	}
	treeThree, treeThreeErr := s.Tree(ctx, parent.ID, 1)
	if treeThreeErr != nil || treeThree.Item.ID != parent.ID || len(treeThree.Children) != 2 {
		t.Fatalf("late-created root tree incorrect: %+v %v", treeThree, treeThreeErr)
	}
	if e = s.PatchComponent(ctx, parentPart.ID, slot.ID, map[string]any{"required_quantity": float64(1)}); e == nil {
		t.Fatal("quantity decrease below active count accepted")
	}
	for _, v := range freshInstalls {
		if e = s.Remove(ctx, parent.ID, v.ID); e != nil {
			t.Fatal(e)
		}
	}
	if e = s.ArchivePart(ctx, childPart.ID); e == nil {
		t.Fatal("part with active inventory archived")
	}
	archiveParent := &models.Part{SKU: "ARCHIVE-PARENT", Name: "Archive"}
	archiveChild := &models.Part{SKU: "ARCHIVE-CHILD", Name: "Child"}
	for _, p := range []*models.Part{archiveParent, archiveChild} {
		if e = s.CreatePart(ctx, p); e != nil {
			t.Fatal(e)
		}
	}
	if e = s.CreateComponent(ctx, archiveParent.ID, &models.PartComponent{ChildPartID: archiveChild.ID, Slot: "child", RequiredQuantity: 1}); e != nil {
		t.Fatal(e)
	}
	if e = s.ArchivePart(ctx, archiveChild.ID); e == nil {
		t.Fatal("active BOM child archived")
	}
	if e = s.ArchivePart(ctx, archiveParent.ID); e != nil {
		t.Fatal(e)
	}
	if e = s.ArchivePart(ctx, archiveChild.ID); e != nil {
		t.Fatal(e)
	}
	if e = s.PatchPart(ctx, archiveParent.ID, map[string]any{"archived_at": nil}); e == nil {
		t.Fatal("restored parent with archived BOM child")
	}
	if e = s.PatchPart(ctx, archiveChild.ID, map[string]any{"archived_at": nil}); e != nil {
		t.Fatal(e)
	}
	if e = s.PatchPart(ctx, archiveParent.ID, map[string]any{"archived_at": nil}); e != nil {
		t.Fatal(e)
	}
	for _, sku := range []string{"literal%sku", "literal_sku"} {
		if e = s.CreatePart(ctx, &models.Part{SKU: sku, Name: "Literal"}); e != nil {
			t.Fatal(e)
		}
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
	app := routes.NewApp(s, func(context.Context) error { return nil })
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{{"GET", "/api/v1/parts?limit=1&offset=1", "", 200}, {"GET", "/api/v1/inventory/" + parent.ID.String(), "", 200}, {"PATCH", "/api/v1/inventory/" + parent.ID.String(), `{"location":" HTTP shelf ","metadata":{"large":9007199254740993}}`, 200}, {"POST", "/api/v1/inventory", `{"part_id":"` + uuid.New().String() + `"}`, 404}} {
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
	edges := []*models.PartComponent{{ChildPartID: child.ID, Slot: "a", RequiredQuantity: 2, ParentPart: &models.Part{ID: injectedID, SKU: "INJECTED", Name: "Unexpected parent"}}, {ChildPartID: child.ID, Slot: "b", RequiredQuantity: 1, IsOptional: true}, {ChildPartID: child.ID, Slot: "c", RequiredQuantity: 4}}
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
		if edge.ID != edges[j].ID || edge.ChildPartID != child.ID || edge.ParentPart == nil || edge.ParentPart.ID != edge.ParentPartID || edge.RequiredQuantity != edges[j].RequiredQuantity || edge.IsOptional != edges[j].IsOptional {
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
