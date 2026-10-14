package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	migrations "github.com/hoshina-dev/papi2/sql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const StructuralLockKey int64 = 72627432

func Connect(dsn string) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(dsn), &gorm.Config{})
}

func Migrate(ctx context.Context, db *gorm.DB) error {
	pool, err := db.DB()
	if err != nil {
		return err
	}
	tx, err := pool.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var schema string
	if err = tx.QueryRowContext(ctx, "SELECT current_schema()").Scan(&schema); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `SET LOCAL search_path = "`+strings.ReplaceAll(schema, `"`, `""`)+`", pg_temp`); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "SET LOCAL lock_timeout = '5s'"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", StructuralLockKey+1); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	files, err := fs.Glob(migrations.Migrations, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)
	for _, name := range files {
		var applied bool
		if err = tx.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)", name).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		body, readErr := migrations.Migrations.ReadFile(name)
		if readErr != nil {
			return readErr
		}
		if _, err = tx.ExecContext(ctx, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO schema_migrations(version) VALUES ($1)", name); err != nil {
			return err
		}
	}
	return tx.Commit()
}
