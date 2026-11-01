package repositories

import (
	"context"
	"database/sql"
	"github.com/google/uuid"
	"github.com/hoshina-dev/katsukura/internal/models"
	"github.com/hoshina-dev/katsukura/internal/services"
	"gorm.io/gorm"
	"strings"
)

type Repository struct{ db *gorm.DB }

func New(db *gorm.DB) *Repository { return &Repository{db} }
func (r *Repository) WithLock(ctx context.Context, fn func(services.Store) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SET LOCAL lock_timeout = '5s'").Error; err != nil {
			return err
		}
		if err := tx.Exec("SELECT pg_advisory_xact_lock(72627432)").Error; err != nil {
			return err
		}
		return fn(New(tx))
	}, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
}

// first loads one row by id with the given associations preloaded.
func first[T any](ctx context.Context, db *gorm.DB, id uuid.UUID, preload ...string) (*T, error) {
	q := db.WithContext(ctx)
	for _, p := range preload {
		q = q.Preload(p)
	}
	v := new(T)
	return v, q.First(v, "id = ?", id).Error
}
func (r *Repository) GetPart(ctx context.Context, id uuid.UUID) (*models.Part, error) {
	return first[models.Part](ctx, r.db, id)
}
func (r *Repository) GetItem(ctx context.Context, id uuid.UUID) (*models.InventoryItem, error) {
	v := new(models.InventoryItem)
	return v, withParent(r.db.WithContext(ctx)).Preload("Part").First(v, "id = ?", id).Error
}

// withParent preloads the item's active installation and its parent item.
func withParent(q *gorm.DB) *gorm.DB {
	return q.Preload("Parent", "removed_at IS NULL").Preload("Parent.ParentItem.Part")
}
func (r *Repository) GetComponent(ctx context.Context, id uuid.UUID) (*models.PartComponent, error) {
	return first[models.PartComponent](ctx, r.db, id)
}
func (r *Repository) GetInstallation(ctx context.Context, id uuid.UUID) (*models.ItemComponent, error) {
	return first[models.ItemComponent](ctx, r.db, id, "ComponentItem.Part")
}

// Create inserts a row, or a slice of rows in batches
func (r *Repository) Create(ctx context.Context, v any) error {
	return r.db.WithContext(ctx).Omit("ChildPart", "ParentPart", "Part", "ComponentItem", "ParentItem", "Parent").CreateInBatches(v, 1000).Error
}

const notInstalled = "NOT EXISTS (SELECT 1 FROM item_components c WHERE c.component_item_id = inventory_items.id AND c.removed_at IS NULL)"

// AvailableItems returns up to limit ids of a part's items that are not
// installed anywhere, oldest first
func (r *Repository) AvailableItems(ctx context.Context, partID uuid.UUID, limit int) ([]uuid.UUID, error) {
	ids := []uuid.UUID{}
	e := r.db.WithContext(ctx).Model(&models.InventoryItem{}).
		Where("part_id = ? AND archived_at IS NULL AND "+notInstalled, partID).
		Order("created_at, id").Limit(limit).Pluck("id", &ids).Error
	return ids, e
}
func (r *Repository) HasItems(ctx context.Context, partID uuid.UUID) (ok bool, e error) {
	e = r.db.WithContext(ctx).Raw("SELECT EXISTS (SELECT 1 FROM inventory_items WHERE part_id = ? AND archived_at IS NULL)", partID).Scan(&ok).Error
	return
}
func (r *Repository) Update(ctx context.Context, v any, id uuid.UUID, fields map[string]any) error {
	return r.db.WithContext(ctx).Model(v).Where("id = ?", id).Updates(fields).Error
}
func (r *Repository) DeleteComponent(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&models.PartComponent{}, "id = ?", id).Error
}
func (r *Repository) Components(ctx context.Context, id uuid.UUID) ([]models.PartComponent, error) {
	v := []models.PartComponent{}
	e := r.db.WithContext(ctx).Preload("ChildPart").Where("parent_part_id = ?", id).Order("created_at DESC, id DESC").Find(&v).Error
	return v, e
}
func (r *Repository) ParentComponents(ctx context.Context, id uuid.UUID) ([]models.PartComponent, error) {
	v := []models.PartComponent{}
	e := r.db.WithContext(ctx).Preload("ParentPart").Where("child_part_id = ?", id).Order("slot ASC, id ASC").Find(&v).Error
	return v, e
}
func (r *Repository) Installations(ctx context.Context, id uuid.UUID, active bool) ([]models.ItemComponent, error) {
	v := []models.ItemComponent{}
	q := r.db.WithContext(ctx).Preload("ComponentItem.Part").Where("parent_item_id = ?", id)
	if active {
		q = q.Where("removed_at IS NULL")
	} else {
		q = q.Where("removed_at IS NOT NULL")
	}
	e := q.Order("installed_at DESC, id DESC").Find(&v).Error
	return v, e
}
func (r *Repository) Parts(ctx context.Context, f models.Filter) (models.Page[models.Part], error) {
	v := models.Page[models.Part]{Data: []models.Part{}, Limit: f.Limit, Offset: f.Offset}
	q := r.db.WithContext(ctx).Model(&models.Part{})
	if !f.IncludeArchived {
		q = q.Where("archived_at IS NULL")
	}
	if f.Search != "" {
		q = q.Where("sku ILIKE @s OR name ILIKE @s", sql.Named("s", like(f.Search)))
	}
	if e := q.Count(&v.Total).Error; e != nil {
		return v, e
	}
	e := q.Order(partOrder[f.Sort]).Limit(f.Limit).Offset(f.Offset).Find(&v.Data).Error
	return v, e
}

const itemCount = "(SELECT count(*) FROM inventory_items i WHERE i.part_id = parts.id AND i.archived_at IS NULL"

// partOrder maps Filter.Sort to ORDER BY; ties fall back to name so pages are stable
var partOrder = map[string]string{
	"":                "created_at DESC, id DESC",
	"newest":          "created_at DESC, id DESC",
	"name":            "lower(name), id",
	"items":           itemCount + ") DESC, lower(name), id",
	"available_items": itemCount + " AND NOT EXISTS (SELECT 1 FROM item_components c WHERE c.component_item_id = i.id AND c.removed_at IS NULL)) DESC, lower(name), id",
}

func (r *Repository) Items(ctx context.Context, f models.Filter) (models.Page[models.InventoryItem], error) {
	v := models.Page[models.InventoryItem]{Data: []models.InventoryItem{}, Limit: f.Limit, Offset: f.Offset}
	q := r.db.WithContext(ctx).Model(&models.InventoryItem{})
	if !f.IncludeArchived {
		q = q.Where("inventory_items.archived_at IS NULL")
	}
	if f.PartID != nil {
		q = q.Where("inventory_items.part_id = ?", *f.PartID)
	}
	if f.Available {
		q = q.Where(notInstalled)
	}
	if f.Search != "" {
		q = q.Joins("JOIN parts ON parts.id = inventory_items.part_id").Where("inventory_items.serial_number ILIKE @s OR parts.sku ILIKE @s OR parts.name ILIKE @s", sql.Named("s", like(f.Search)))
	}
	if e := q.Count(&v.Total).Error; e != nil {
		return v, e
	}
	e := withParent(q).Preload("Part").Order("inventory_items.created_at DESC, inventory_items.id DESC").Limit(f.Limit).Offset(f.Offset).Find(&v.Data).Error
	return v, e
}

// Stock counts the unarchived items of each part; parts without items are left out.
func (r *Repository) Stock(ctx context.Context, partIDs []uuid.UUID) (map[uuid.UUID]models.Stock, error) {
	var rows []struct {
		PartID uuid.UUID
		models.Stock
	}
	e := r.db.WithContext(ctx).Raw(`SELECT part_id, count(*) AS total,
	count(*) FILTER (WHERE NOT `+notInstalled+`) AS in_use,
	count(*) FILTER (WHERE `+notInstalled+`) AS available
	FROM inventory_items WHERE archived_at IS NULL AND part_id IN ? GROUP BY part_id`, partIDs).Scan(&rows).Error
	stock := make(map[uuid.UUID]models.Stock, len(rows))
	for _, row := range rows {
		stock[row.PartID] = row.Stock
	}
	return stock, e
}
func (r *Repository) Summary(ctx context.Context) (models.Summary, error) {
	v := models.Summary{}
	e := r.db.WithContext(ctx).Raw(`SELECT
	(SELECT count(*) FROM parts WHERE archived_at IS NULL) AS parts,
	(SELECT count(*) FROM inventory_items WHERE archived_at IS NULL) AS items,
	(SELECT count(*) FROM item_components ic JOIN inventory_items i ON i.id = ic.component_item_id
		WHERE ic.removed_at IS NULL AND i.archived_at IS NULL) AS installed_items,
	(SELECT count(*) FROM inventory_items WHERE archived_at IS NULL AND ` + notInstalled + `) AS root_items`).Scan(&v).Error
	return v, e
}

// like is a pattern matching s anywhere, with LIKE wildcards in s escaped.
func like(s string) string {
	return "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s) + "%"
}
func (r *Repository) Read(ctx context.Context, fn func(services.Store) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if e := tx.Exec("SET LOCAL statement_timeout = '15s'").Error; e != nil {
			return e
		}
		return fn(New(tx))
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
}

func (r *Repository) Remove(ctx context.Context, parent, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&models.ItemComponent{}).Where("id = ? AND parent_item_id = ? AND removed_at IS NULL", id, parent).Update("removed_at", gorm.Expr("clock_timestamp()")).Error
}

func (r *Repository) Tree(ctx context.Context, id uuid.UUID, depth int) (*models.TreeNode, error) {
	type row struct {
		models.InventoryItem
		ParentID   *uuid.UUID
		Depth      int
		ChildCount int
	}
	rows := []row{}
	err := r.db.WithContext(ctx).Raw(`WITH RECURSIVE walk AS (
 SELECT i.*, NULL::uuid AS parent_id, 0 AS depth, ARRAY[i.id] AS visited FROM inventory_items i WHERE i.id = ?
 UNION ALL
 SELECT i.*, ic.parent_item_id, w.depth+1, w.visited || ic.component_item_id FROM walk w JOIN item_components ic ON ic.parent_item_id=w.id AND ic.removed_at IS NULL JOIN inventory_items i ON i.id=ic.component_item_id WHERE w.depth < ? AND NOT ic.component_item_id=ANY(w.visited)
 ) SELECT w.*, (SELECT count(*) FROM item_components ic WHERE ic.parent_item_id=w.id AND ic.removed_at IS NULL) AS child_count FROM walk w LIMIT 10001`, id, depth).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if len(rows) > 10000 {
		rows = rows[:10000]
	}
	partIDs := []uuid.UUID{}
	for _, v := range rows {
		partIDs = append(partIDs, v.PartID)
	}
	parts := []models.Part{}
	if err = r.db.WithContext(ctx).Where("id IN ?", partIDs).Find(&parts).Error; err != nil {
		return nil, err
	}
	byPart := map[uuid.UUID]*models.Part{}
	for j := range parts {
		byPart[parts[j].ID] = &parts[j]
	}
	byParent := map[uuid.UUID][]int{}
	for j, v := range rows {
		if v.ParentID != nil {
			byParent[*v.ParentID] = append(byParent[*v.ParentID], j)
		}
	}
	var build func(int) models.TreeNode
	build = func(j int) models.TreeNode {
		v := rows[j]
		v.Part = byPart[v.PartID]
		n := models.TreeNode{Item: v.InventoryItem, Children: []models.TreeNode{}, Truncated: len(byParent[v.ID]) < v.ChildCount}
		for _, child := range byParent[v.ID] {
			n.Children = append(n.Children, build(child))
		}
		return n
	}
	for j, v := range rows {
		if v.ID == id {
			root := build(j)
			return &root, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

// ArchivePartItems archives every item of a part; composites release their
// components first, so those return to stock
func (r *Repository) ArchivePartItems(ctx context.Context, partID uuid.UUID) error {
	db := r.db.WithContext(ctx)
	if e := db.Exec(`UPDATE item_components SET removed_at = clock_timestamp() WHERE removed_at IS NULL
		AND parent_item_id IN (SELECT id FROM inventory_items WHERE part_id = ? AND archived_at IS NULL)`, partID).Error; e != nil {
		return e
	}
	return db.Exec("UPDATE inventory_items SET archived_at = clock_timestamp() WHERE part_id = ? AND archived_at IS NULL", partID).Error
}
func (r *Repository) Archive(ctx context.Context, v any, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(v).Where("id=? AND archived_at IS NULL", id).Update("archived_at", gorm.Expr("clock_timestamp()")).Error
}
