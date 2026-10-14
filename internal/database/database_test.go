//go:build integration

package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func testDatabase(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	config, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	admin := stdlib.OpenDB(*config)
	schema := "test_" + uuid.NewString()
	schema = pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	config.RuntimeParams["search_path"] = schema
	pool := stdlib.OpenDB(*config)
	t.Cleanup(func() { pool.Close(); _, _ = admin.Exec("DROP SCHEMA " + schema + " CASCADE"); admin.Close() })
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: pool}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("migration rerun: %v", err)
	}
	return pool
}

func execOK(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
}
func expectCode(t *testing.T, err error, code string) {
	t.Helper()
	var pgerr *pgconn.PgError
	if !errors.As(err, &pgerr) || pgerr.Code != code {
		t.Fatalf("expected %s, got %v", code, err)
	}
}
func fixture(t *testing.T, db *sql.DB) (string, string, string, string, string, string) {
	t.Helper()
	p, c, b, parent, child, other := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	execOK(t, db, "INSERT INTO parts(id,sku,name) VALUES ($1,'P','Parent'),($2,'C','Child')", p, c)
	execOK(t, db, "INSERT INTO part_components(id,parent_part_id,child_part_id,slot,required_quantity) VALUES ($1,$2,$3,'slot',1)", b, p, c)
	execOK(t, db, "INSERT INTO inventory_items(id,part_id,assembly_state) VALUES ($1,$2,'complete'),($3,$4,'draft'),($5,$4,'draft')", parent, p, child, c, other)
	return p, c, b, parent, child, other
}

const installSQL = "INSERT INTO item_components(parent_item_id,component_item_id,part_component_id) VALUES ($1,$2,$3)"

func TestDirectSQLInvariants(t *testing.T) {
	db := testDatabase(t)
	p, c, b, parent, child, other := fixture(t, db)
	_, err := db.Exec("UPDATE parts SET metadata='null' WHERE id=$1", p)
	expectCode(t, err, "23514")
	_, err = db.Exec("UPDATE inventory_items SET part_id=$1 WHERE id=$2", p, child)
	expectCode(t, err, "23514")
	_, err = db.Exec(installSQL, parent, parent, b)
	expectCode(t, err, "23503")
	execOK(t, db, installSQL, parent, child, b)
	var snapshot string
	if err := db.QueryRow("SELECT bom_snapshot->>'child_sku' FROM item_components").Scan(&snapshot); err != nil || snapshot != "C" {
		t.Fatalf("snapshot %q: %v", snapshot, err)
	}
	_, err = db.Exec(installSQL, parent, other, b)
	expectCode(t, err, "23514")
	_, err = db.Exec("UPDATE part_components SET required_quantity=0 WHERE id=$1", b)
	expectCode(t, err, "23514")
	_, err = db.Exec("UPDATE inventory_items SET archived_at=now() WHERE id=$1", child)
	expectCode(t, err, "23514")
	_, err = db.Exec("INSERT INTO part_components(parent_part_id,child_part_id,slot,required_quantity) VALUES ($1,$2,'back',1)", c, p)
	expectCode(t, err, "23514")
	execOK(t, db, "UPDATE item_components SET removed_at=clock_timestamp() WHERE parent_item_id=$1", parent)
	_, err = db.Exec("UPDATE item_components SET removed_at=NULL")
	expectCode(t, err, "23514")
	_, err = db.Exec("DELETE FROM item_components")
	expectCode(t, err, "23514")
	_, err = db.Exec("UPDATE part_components SET child_part_id=$1 WHERE id=$2", p, b)
	expectCode(t, err, "23503")
	_, err = db.Exec("DELETE FROM part_components WHERE id=$1", b)
	expectCode(t, err, "23503")
	execOK(t, db, "UPDATE inventory_items SET archived_at=now() WHERE id=$1", child)
	execOK(t, db, "UPDATE inventory_items SET archived_at=NULL WHERE id=$1", child)
	execOK(t, db, installSQL, parent, other, b)
	_, err = db.Exec("TRUNCATE item_components")
	expectCode(t, err, "23514")
	tx, err := db.BeginTx(context.Background(), &sql.TxOptions{Isolation: sql.LevelRepeatableRead})
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec("UPDATE inventory_items SET location='x' WHERE id=$1", parent)
	expectCode(t, err, "23514")
	tx.Rollback()
}

func TestDirectSQLQuantityRace(t *testing.T) {
	db := testDatabase(t)
	_, _, b, parent, child, other := fixture(t, db)
	first, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = first.Exec(installSQL, parent, child, b); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { _, e := db.Exec(installSQL, parent, other, b); result <- e }()
	select {
	case e := <-result:
		t.Fatalf("second writer did not wait: %v", e)
	case <-time.After(150 * time.Millisecond):
	}
	if err = first.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case err = <-result:
		expectCode(t, err, "23514")
	case <-time.After(6 * time.Second):
		t.Fatal("writer never completed")
	}
}

func TestDirectSQLBOMCycleRace(t *testing.T) {
	db := testDatabase(t)
	p, c := uuid.NewString(), uuid.NewString()
	execOK(t, db, "INSERT INTO parts(id,sku,name) VALUES ($1,'P','P'),($2,'C','C')", p, c)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	start := make(chan struct{})
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			a, z := p, c
			if i == 1 {
				a, z = c, p
			}
			_, e := db.Exec("INSERT INTO part_components(parent_part_id,child_part_id,slot,required_quantity) VALUES ($1,$2,$3,1)", a, z, fmt.Sprint(i))
			results <- e
		}(i)
	}
	close(start)
	wg.Wait()
	close(results)
	success, fail := 0, 0
	for e := range results {
		if e == nil {
			success++
		} else {
			expectCode(t, e, "23514")
			fail++
		}
	}
	if success != 1 || fail != 1 {
		t.Fatalf("success=%d fail=%d", success, fail)
	}
}

func TestTriggerSearchPathCannotBeShadowed(t *testing.T) {
	db := testDatabase(t)
	p, c, _, _, _, _ := fixture(t, db)
	conn, err := db.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	var schema string
	if err = conn.QueryRowContext(context.Background(), "SELECT current_schema()").Scan(&schema); err != nil {
		t.Fatal(err)
	}
	qualified := pgx.Identifier{schema, "part_components"}.Sanitize()
	if _, err = conn.ExecContext(context.Background(), "CREATE TEMP TABLE part_components (LIKE "+qualified+")"); err != nil {
		t.Fatal(err)
	}
	_, err = conn.ExecContext(context.Background(), "INSERT INTO "+qualified+" (parent_part_id,child_part_id,slot,required_quantity) VALUES ($1,$2,'cycle',1)", c, p)
	expectCode(t, err, "23514")
}

func TestFinalStateSchemaEditsAndArchives(t *testing.T) {
	db := testDatabase(t)
	p, c, b, parent, child, other := fixture(t, db)
	execOK(t, db, "UPDATE part_components SET required_quantity=2 WHERE id=$1", b)
	execOK(t, db, installSQL, parent, child, b)
	execOK(t, db, installSQL, parent, other, b)
	_, err := db.Exec("UPDATE part_components SET required_quantity=1 WHERE id=$1", b)
	expectCode(t, err, "23514")
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec("UPDATE part_components SET required_quantity=1 WHERE id=$1", b); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec("UPDATE item_components SET removed_at=clock_timestamp() WHERE component_item_id=$1", other); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec("UPDATE parts SET archived_at=now() WHERE id=$1", p)
	expectCode(t, err, "23514")
	execOK(t, db, "UPDATE item_components SET removed_at=clock_timestamp() WHERE removed_at IS NULL")
	execOK(t, db, "UPDATE inventory_items SET archived_at=now()")
	_, err = db.Exec("UPDATE parts SET archived_at=now() WHERE id=$1", c)
	expectCode(t, err, "23514")
	execOK(t, db, "UPDATE parts SET archived_at=now() WHERE id=$1", p)
	execOK(t, db, "UPDATE parts SET archived_at=now() WHERE id=$1", c)
	_, err = db.Exec("UPDATE parts SET archived_at=NULL WHERE id=$1", p)
	expectCode(t, err, "23514")
	execOK(t, db, "UPDATE parts SET archived_at=NULL WHERE id=$1", c)
	execOK(t, db, "UPDATE parts SET archived_at=NULL WHERE id=$1", p)
}
