package repositories

import (
	"context"
	"database/sql"

	"github.com/hoshina-dev/katsukura/internal/models"
	"gorm.io/gorm"
)

const hasBOM = "EXISTS (SELECT 1 FROM part_components pc WHERE pc.parent_part_id = parts.id)"
const categories = `jsonb_array_elements_text(
	CASE WHEN jsonb_typeof(parts.metadata->'category') = 'array'
	THEN parts.metadata->'category' ELSE '[]'::jsonb END)`
const temperatureStage = `CASE WHEN jsonb_typeof(parts.metadata->'temperature_stage') = 'number'
	THEN (parts.metadata->>'temperature_stage')::numeric END`

const partInventory = " FROM inventory_items WHERE inventory_items.part_id = parts.id AND inventory_items.archived_at IS NULL"
const stockTotal = "(SELECT count(*)" + partInventory + ")"
const stockInUse = "(SELECT count(*)" + partInventory + " AND NOT (" + notInstalled + "))"
const stockAvailable = "(SELECT count(*)" + partInventory + " AND " + notInstalled + ")"
const hasStock = "EXISTS (SELECT 1" + partInventory + ")"
const hasFreeStock = "EXISTS (SELECT 1" + partInventory + " AND " + notInstalled + ")"

func partScope(q *gorm.DB, includeArchived, onlyAssemblies bool) *gorm.DB {
	if !includeArchived {
		q = q.Where("parts.archived_at IS NULL")
	}
	if onlyAssemblies {
		q = q.Where(hasBOM)
	}
	return q
}

func (r *Repository) Parts(ctx context.Context, f models.Filter) (models.Page[models.Part], error) {
	v := models.Page[models.Part]{Data: []models.Part{}, Limit: f.Limit, Offset: f.Offset}
	q := partScope(r.db.WithContext(ctx).Model(&models.Part{}), f.IncludeArchived, f.HasBOM)
	if f.Search != "" {
		q = q.Where("sku ILIKE @s OR name ILIKE @s OR description ILIKE @s", sql.Named("s", like(f.Search)))
	}
	q = applyCatalogFilters(q, f.Catalog)
	if err := q.Count(&v.Total).Error; err != nil {
		return v, err
	}
	err := q.Order(partOrder(f.Sort, f.Order)).Limit(f.Limit).Offset(f.Offset).Find(&v.Data).Error
	return v, err
}

func applyCatalogFilters(q *gorm.DB, f models.CatalogFilters) *gorm.DB {
	switch f.UnitType {
	case "assembly":
		q = q.Where(hasBOM)
	case "part":
		q = q.Where("NOT (" + hasBOM + ")")
	}
	if f.Category != "" {
		q = q.Where("EXISTS (SELECT 1 FROM "+categories+" AS tag(value) WHERE lower(btrim(tag.value)) = lower(?))", f.Category)
	}
	for _, field := range []struct{ key, value string }{
		{"manufacturer", f.Manufacturer},
		{"country_of_origin", f.CountryOfOrigin},
	} {
		if field.value != "" {
			q = q.Where("lower(btrim(parts.metadata->>CAST(? AS text))) = lower(?)", field.key, field.value)
		}
	}
	if f.TemperatureStage != "" {
		q = q.Where("("+temperatureStage+") = CAST(? AS numeric)", f.TemperatureStage)
	}
	switch f.Stock {
	case "available":
		q = q.Where(hasFreeStock)
	case "in_use":
		q = q.Where(hasStock).Where("NOT (" + hasFreeStock + ")")
	case "empty":
		q = q.Where("NOT (" + hasStock + ")")
	}
	switch f.BOMEditing {
	case "editable":
		q = q.Where("NOT (" + hasStock + ")")
	case "locked":
		q = q.Where(hasStock)
	}
	switch f.Tracking {
	case "serial":
		q = q.Where("parts.serial_aware")
	case "quantity":
		q = q.Where("NOT parts.serial_aware")
	}
	return q
}

var partSorts = map[string]struct{ expression, defaultOrder string }{
	"name":            {"lower(name)", "ASC"},
	"price":           {"coalesce(unit_price, part_composite_price(parts.id))", "ASC"},
	"items":           {stockTotal, "DESC"},
	"in_use_items":    {stockInUse, "DESC"},
	"available_items": {stockAvailable, "DESC"},
	"utilisation":     {"coalesce(" + stockInUse + "::numeric / nullif(" + stockTotal + ", 0), 0)", "DESC"},
	"slots":           {"(SELECT count(*) FROM part_components pc WHERE pc.parent_part_id = parts.id)", "DESC"},
	"editing":         {"(" + hasStock + ")", "ASC"},
}

func partOrder(sort, order string) string {
	field, ok := partSorts[sort]
	if !ok {
		field.expression, field.defaultOrder = "created_at", "DESC"
	}
	direction := field.defaultOrder
	switch order {
	case "asc":
		direction = "ASC"
	case "desc":
		direction = "DESC"
	}
	if !ok {
		return field.expression + " " + direction + ", id " + direction
	}
	if sort == "name" {
		return field.expression + " " + direction + ", id"
	}
	return field.expression + " " + direction + ", lower(name), id"
}

func (r *Repository) CatalogFacets(ctx context.Context, onlyAssemblies bool, unitType string) (models.CatalogFacets, error) {
	rows := []struct{ Field, Value string }{}
	q := partScope(r.db.WithContext(ctx).Table("parts"), false, onlyAssemblies)
	q = applyCatalogFilters(q, models.CatalogFilters{UnitType: unitType})
	err := q.Select("facet.field, min(facet.value) AS value").
		Joins(`CROSS JOIN LATERAL (
			SELECT 'category', btrim(tag.value) FROM ` + categories + ` AS tag(value)
			UNION ALL SELECT 'manufacturer', btrim(parts.metadata->>'manufacturer')
			UNION ALL SELECT 'country_of_origin', upper(btrim(parts.metadata->>'country_of_origin'))
			UNION ALL SELECT 'temperature_stage', trim_scale(` + temperatureStage + `)::text
		) AS facet(field, value)`).
		Where("facet.value <> ''").
		Group("facet.field, lower(facet.value)").
		Order("facet.field, lower(facet.value)").Find(&rows).Error
	values := models.CatalogFacets{
		"category": {}, "manufacturer": {}, "country_of_origin": {}, "temperature_stage": {},
	}
	for _, row := range rows {
		values[row.Field] = append(values[row.Field], row.Value)
	}
	return values, err
}
