//go:build integration

package database

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

// expectConstraint is expectCode plus the constraint name. The name is an API
// contract: apperrors.Translate maps it to the HTTP 409 message, and the
// acceptance suite asserts substrings of those messages.
func expectConstraint(t *testing.T, err error, code, constraint string) {
	t.Helper()
	var pgerr *pgconn.PgError
	if !errors.As(err, &pgerr) {
		t.Fatalf("expected %s/%s, got %v", code, constraint, err)
	}
	if pgerr.Code != code || pgerr.ConstraintName != constraint {
		t.Fatalf("expected %s/%s, got %s/%s (%s)", code, constraint, pgerr.Code, pgerr.ConstraintName, pgerr.Message)
	}
}

// assertNoViolations is the equivalence oracle: papi2_audit_structure() runs the
// original whole-graph queries, so an empty result proves the row-scoped checks
// admitted only states the retired validator would also have admitted.
func assertNoViolations(t *testing.T, db *sql.DB) {
	t.Helper()
	rows, err := db.Query("SELECT v FROM papi2_audit_structure() v")
	if err != nil {
		t.Fatalf("audit: %v", err)
	}
	defer rows.Close()
	var found []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			t.Fatal(err)
		}
		found = append(found, v)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(found) > 0 {
		t.Fatalf("audit reported violations: %s", strings.Join(found, ", "))
	}
}

func auditViolations(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query("SELECT v FROM papi2_audit_structure() v")
	if err != nil {
		t.Fatalf("audit: %v", err)
	}
	defer rows.Close()
	var found []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			t.Fatal(err)
		}
		found = append(found, v)
	}
	return found
}

func makeParts(t *testing.T, db *sql.DB, skus ...string) map[string]string {
	t.Helper()
	ids := map[string]string{}
	for _, sku := range skus {
		id := uuid.NewString()
		execOK(t, db, "INSERT INTO parts(id,sku,name) VALUES ($1,$2,$2)", id, sku)
		ids[sku] = id
	}
	return ids
}

func addEdge(t *testing.T, db *sql.DB, parent, child, slot string, quantity int) string {
	t.Helper()
	id := uuid.NewString()
	execOK(t, db, "INSERT INTO part_components(id,parent_part_id,child_part_id,slot,required_quantity) VALUES ($1,$2,$3,$4,$5)", id, parent, child, slot, quantity)
	return id
}

func makeItem(t *testing.T, db *sql.DB, part string) string {
	t.Helper()
	id := uuid.NewString()
	execOK(t, db, "INSERT INTO inventory_items(id,part_id,assembly_state) VALUES ($1,$2,'draft')", id, part)
	return id
}

const insertEdgeSQL = "INSERT INTO part_components(parent_part_id,child_part_id,slot,required_quantity) VALUES ($1,$2,$3,1)"

// A non-adjacent cycle is the case a naive "is the child already my direct
// parent?" shortcut would miss, so the probe must do real reachability.
func TestBOMCycleDeepChain(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "A", "B", "C", "D", "E", "F")
	chain := []string{"A", "B", "C", "D", "E", "F"}
	for i := 0; i < len(chain)-1; i++ {
		addEdge(t, db, p[chain[i]], p[chain[i+1]], "s"+chain[i], 1)
	}
	// A shortcut edge is a legal DAG edge: the probe must not over-reject.
	execOK(t, db, insertEdgeSQL, p["A"], p["C"], "shortcut")
	_, err := db.Exec(insertEdgeSQL, p["F"], p["A"], "loop")
	expectConstraint(t, err, "23514", "papi2_bom_cycle")
	assertNoViolations(t, db)
}

func TestBOMSelfEdge(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "A")
	_, err := db.Exec(insertEdgeSQL, p["A"], p["A"], "self")
	expectConstraint(t, err, "23514", "papi2_bom_cycle")
	assertNoViolations(t, db)
}

// Built with no item_components referencing the row: otherwise the composite FK
// on (part_component_id, parent_part_id, child_part_id) fires 23503 first and the
// test would prove nothing about the cycle probe.
func TestBOMCycleViaChildUpdate(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "A", "B", "C", "D")
	addEdge(t, db, p["A"], p["B"], "ab", 1)
	addEdge(t, db, p["B"], p["C"], "bc", 1)
	edge := addEdge(t, db, p["C"], p["D"], "cd", 1)
	_, err := db.Exec("UPDATE part_components SET child_part_id=$1 WHERE id=$2", p["A"], edge)
	expectConstraint(t, err, "23514", "papi2_bom_cycle")
	// A slot-only update must skip the probe entirely via the trigger WHEN gate.
	execOK(t, db, "UPDATE part_components SET slot='renamed' WHERE id=$1", edge)
	assertNoViolations(t, db)
}

// The disjoint-endpoint counterexample. With A->B and C->D present, inserting
// B->C and D->A each pass an individual reachability probe yet jointly close
// A->B->C->D->A. The endpoint pairs {B,C} and {D,A} share no row, so this test
// fails if anyone ever replaces the global advisory lock with row locks on the
// edge endpoints.
func TestBOMCycleDisjointEndpointsConcurrency(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "A", "B", "C", "D")
	addEdge(t, db, p["A"], p["B"], "ab", 1)
	addEdge(t, db, p["C"], p["D"], "cd", 1)

	type edge struct{ parent, child string }
	edges := []edge{{p["B"], p["C"]}, {p["D"], p["A"]}}
	results := make(chan error, len(edges))
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, e := range edges {
		wg.Add(1)
		go func(i int, e edge) {
			defer wg.Done()
			<-start
			_, err := db.Exec(insertEdgeSQL, e.parent, e.child, fmt.Sprint("concurrent", i))
			results <- err
		}(i, e)
	}
	close(start)
	wg.Wait()
	close(results)

	success, fail := 0, 0
	for err := range results {
		if err == nil {
			success++
			continue
		}
		expectConstraint(t, err, "23514", "papi2_bom_cycle")
		fail++
	}
	if success != 1 || fail != 1 {
		t.Fatalf("success=%d fail=%d; expected exactly one of each", success, fail)
	}
	assertNoViolations(t, db)
}

// An ownership cycle is unreachable while the BOM is acyclic: an active edge
// item_i(part X) -> item_j(part Y) requires a BOM edge X->Y, so an ownership
// cycle implies a BOM cycle. This test therefore has to corrupt the BOM first,
// which both documents the unreachability and exercises the walk-up at depth 3.
func TestItemOwnershipCycleRequiresCorruptBOM(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "X", "Y", "Z")
	execOK(t, db, "ALTER TABLE part_components DISABLE TRIGGER check_bom_cycle_insert")
	xy := addEdge(t, db, p["X"], p["Y"], "xy", 1)
	yz := addEdge(t, db, p["Y"], p["Z"], "yz", 1)
	zx := addEdge(t, db, p["Z"], p["X"], "zx", 1)
	execOK(t, db, "ALTER TABLE part_components ENABLE TRIGGER check_bom_cycle_insert")

	ix, iy, iz := makeItem(t, db, p["X"]), makeItem(t, db, p["Y"]), makeItem(t, db, p["Z"])
	execOK(t, db, installSQL, ix, iy, xy)
	execOK(t, db, installSQL, iy, iz, yz)
	_, err := db.Exec(installSQL, iz, ix, zx)
	expectConstraint(t, err, "23514", "papi2_item_cycle")

	// The oracle must see the corruption we injected, and nothing else.
	found := auditViolations(t, db)
	if len(found) != 1 || found[0] != "papi2_bom_cycle" {
		t.Fatalf("audit = %v; want exactly [papi2_bom_cycle]", found)
	}
}

// The depth bound converts a walk over an already-corrupt (non-forest) ownership
// graph into a clean papi2_item_cycle instead of an endless loop.
func TestItemOwnershipDepthBound(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "X", "Y")
	execOK(t, db, "ALTER TABLE part_components DISABLE TRIGGER check_bom_cycle_insert")
	xy := addEdge(t, db, p["X"], p["Y"], "xy", 1)
	yx := addEdge(t, db, p["Y"], p["X"], "yx", 1)
	execOK(t, db, "ALTER TABLE part_components ENABLE TRIGGER check_bom_cycle_insert")

	ix, iy := makeItem(t, db, p["X"]), makeItem(t, db, p["Y"])
	execOK(t, db, "ALTER TABLE item_components DISABLE TRIGGER check_item_cycle_insert")
	execOK(t, db, installSQL, ix, iy, xy)
	execOK(t, db, installSQL, iy, ix, yx)
	execOK(t, db, "ALTER TABLE item_components ENABLE TRIGGER check_item_cycle_insert")

	// ix and iy are now each other's active parent, so walking up never reaches a
	// root. The target is a third item that is not in the cycle, so only the bound
	// can stop the walk.
	unrelated := makeItem(t, db, p["X"])
	_, err := db.Exec("SELECT papi2_assert_item_acyclic($1,$2)", ix, unrelated)
	expectConstraint(t, err, "23514", "papi2_item_cycle")
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && !strings.Contains(pgerr.Message, "exceeds") {
		t.Fatalf("expected the depth-bound message, got %q", pgerr.Message)
	}
}

// Headline regression test for the whole refactor: under the retired uniform
// trigger both of these raised papi2_bom_cycle, because every write to any of the
// four tables recomputed both whole-graph closures.
func TestMetadataPatchDoesNotRunGraphChecks(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "A", "B")
	addEdge(t, db, p["A"], p["B"], "ab", 1)
	execOK(t, db, "ALTER TABLE part_components DISABLE TRIGGER check_bom_cycle_insert")
	addEdge(t, db, p["B"], p["A"], "ba", 1)
	execOK(t, db, "ALTER TABLE part_components ENABLE TRIGGER check_bom_cycle_insert")

	execOK(t, db, "UPDATE parts SET metadata='{\"note\":1}' WHERE id=$1", p["A"])
	execOK(t, db, "UPDATE parts SET name='renamed' WHERE id=$1", p["A"])
	execOK(t, db, "UPDATE parts SET description='text' WHERE id=$1", p["B"])

	found := auditViolations(t, db)
	if len(found) != 1 || found[0] != "papi2_bom_cycle" {
		t.Fatalf("audit = %v; want exactly [papi2_bom_cycle]", found)
	}
}

func TestQuantityCapScopedToSlot(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "P", "C", "Q")
	loaded := addEdge(t, db, p["P"], p["C"], "loaded", 2)
	spare := addEdge(t, db, p["Q"], p["C"], "spare", 2)

	parent := makeItem(t, db, p["P"])
	execOK(t, db, installSQL, parent, makeItem(t, db, p["C"]), loaded)
	execOK(t, db, installSQL, parent, makeItem(t, db, p["C"]), loaded)

	_, err := db.Exec("UPDATE part_components SET required_quantity=1 WHERE id=$1", loaded)
	expectConstraint(t, err, "23514", "papi2_quantity_cap")
	// The identical edit on an unrelated, unused slot must succeed.
	execOK(t, db, "UPDATE part_components SET required_quantity=1 WHERE id=$1", spare)
	assertNoViolations(t, db)
}

func TestArchiveCoherenceScopedToEntity(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "P", "C", "Unrelated")
	addEdge(t, db, p["P"], p["C"], "pc", 1)
	makeItem(t, db, p["P"])

	// Archiving a part with active inventory, and archiving a BOM child whose
	// parent is still active, both still fail.
	_, err := db.Exec("UPDATE parts SET archived_at=now() WHERE id=$1", p["P"])
	expectConstraint(t, err, "23514", "papi2_active_archived")
	_, err = db.Exec("UPDATE parts SET archived_at=now() WHERE id=$1", p["C"])
	expectConstraint(t, err, "23514", "papi2_part_archive_in_use")
	// An unrelated part in the same database archives fine.
	execOK(t, db, "UPDATE parts SET archived_at=now() WHERE id=$1", p["Unrelated"])
	assertNoViolations(t, db)
}

// A removal is always a repair -- it deactivates an edge, so it cannot create a
// cycle or a mismatch and strictly decreases every count. It must therefore run
// no validation at all, even from an over-capacity state.
func TestItemComponentRemovalRunsNoChecks(t *testing.T) {
	db := testDatabase(t)
	p := makeParts(t, db, "P", "C")
	slot := addEdge(t, db, p["P"], p["C"], "slot", 2)
	parent := makeItem(t, db, p["P"])
	execOK(t, db, installSQL, parent, makeItem(t, db, p["C"]), slot)
	execOK(t, db, installSQL, parent, makeItem(t, db, p["C"]), slot)

	execOK(t, db, "ALTER TABLE part_components DISABLE TRIGGER validate_part_component")
	execOK(t, db, "UPDATE part_components SET required_quantity=1 WHERE id=$1", slot)
	execOK(t, db, "ALTER TABLE part_components ENABLE TRIGGER validate_part_component")
	if got := auditViolations(t, db); len(got) != 1 || got[0] != "papi2_quantity_cap" {
		t.Fatalf("audit = %v; want exactly [papi2_quantity_cap]", got)
	}

	// Removing from an over-capacity state must be accepted and must repair it.
	execOK(t, db, "UPDATE item_components SET removed_at=clock_timestamp() WHERE parent_item_id=$1 AND removed_at IS NULL AND id=(SELECT id FROM item_components WHERE parent_item_id=$1 AND removed_at IS NULL LIMIT 1)", parent)
	assertNoViolations(t, db)
}

// Guards the ConstraintName -> message mapping in apperrors.Translate, which the
// acceptance suite asserts substrings of. papi2_slot_match is omitted on purpose:
// it is unreachable while the composite FKs stand, because papi2_protect_rows
// derives parent_part_id/child_part_id from the referenced BOM row, so an
// installation's SKUs cannot disagree with its slot.
func TestConstraintNamesAreStable(t *testing.T) {
	t.Run("papi2_bom_cycle", func(t *testing.T) {
		db := testDatabase(t)
		p := makeParts(t, db, "A", "B")
		addEdge(t, db, p["A"], p["B"], "ab", 1)
		_, err := db.Exec(insertEdgeSQL, p["B"], p["A"], "ba")
		expectConstraint(t, err, "23514", "papi2_bom_cycle")
	})
	t.Run("papi2_item_cycle", func(t *testing.T) {
		db := testDatabase(t)
		id := uuid.NewString()
		_, err := db.Exec("SELECT papi2_assert_item_acyclic($1,$1)", id)
		expectConstraint(t, err, "23514", "papi2_item_cycle")
	})
	t.Run("papi2_quantity_cap", func(t *testing.T) {
		db := testDatabase(t)
		_, _, b, parent, child, other := fixture(t, db)
		execOK(t, db, installSQL, parent, child, b)
		_, err := db.Exec(installSQL, parent, other, b)
		expectConstraint(t, err, "23514", "papi2_quantity_cap")
	})
	t.Run("papi2_active_archived", func(t *testing.T) {
		db := testDatabase(t)
		_, _, b, parent, child, _ := fixture(t, db)
		execOK(t, db, installSQL, parent, child, b)
		_, err := db.Exec("UPDATE inventory_items SET archived_at=now() WHERE id=$1", child)
		expectConstraint(t, err, "23514", "papi2_active_archived")
	})
	t.Run("papi2_part_archive_in_use", func(t *testing.T) {
		db := testDatabase(t)
		p := makeParts(t, db, "P", "C")
		addEdge(t, db, p["P"], p["C"], "pc", 1)
		_, err := db.Exec("UPDATE parts SET archived_at=now() WHERE id=$1", p["C"])
		expectConstraint(t, err, "23514", "papi2_part_archive_in_use")
	})
	t.Run("papi2_sku_in_use", func(t *testing.T) {
		db := testDatabase(t)
		p, _, _, _, _, _ := fixture(t, db)
		_, err := db.Exec("UPDATE parts SET sku='RENAMED' WHERE id=$1", p)
		expectConstraint(t, err, "23514", "papi2_sku_in_use")
	})
	t.Run("papi2_immutable_history", func(t *testing.T) {
		db := testDatabase(t)
		_, _, b, parent, child, _ := fixture(t, db)
		execOK(t, db, installSQL, parent, child, b)
		_, err := db.Exec("DELETE FROM item_components")
		expectConstraint(t, err, "23514", "papi2_immutable_history")
	})
}
