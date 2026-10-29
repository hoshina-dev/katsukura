package models

import (
	"bytes"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"time"
)

type JSONMap map[string]any

func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return "{}", nil
	}
	b, e := json.Marshal(m)
	return string(b), e
}
func (m *JSONMap) Scan(v any) error {
	var b []byte
	switch x := v.(type) {
	case []byte:
		b = x
	case string:
		b = []byte(x)
	default:
		return fmt.Errorf("invalid JSON object")
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	if err := dec.Decode(m); err != nil {
		return err
	}
	if *m == nil {
		return fmt.Errorf("metadata must be an object")
	}
	return nil
}

type Part struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	SKU         string     `json:"sku"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	Metadata    JSONMap    `json:"metadata" gorm:"type:jsonb"`
	ArchivedAt  *time.Time `json:"archived_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	// Counts of the part's items; filled on part lists and details
	Stock *Stock `json:"stock,omitempty" gorm:"-"`
}

// Stock counts a part's unarchived items.
type Stock struct {
	Total int64 `json:"total"`
	// Installed in another item
	InUse int64 `json:"in_use"`
	// Not installed anywhere
	Available int64 `json:"available"`
}
type PartComponent struct {
	ID               uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	ParentPartID     uuid.UUID `json:"parent_part_id"`
	ChildPartID      uuid.UUID `json:"child_part_id"`
	Slot             string    `json:"slot"`
	RequiredQuantity int       `json:"required_quantity"`
	ChildPart        *Part     `json:"child_part,omitempty" gorm:"foreignKey:ChildPartID"`
	ParentPart       *Part     `json:"parent_part,omitempty" gorm:"foreignKey:ParentPartID"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}
type InventoryItem struct {
	ID           uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	PartID       uuid.UUID  `json:"part_id"`
	SerialNumber *string    `json:"serial_number"`
	Location     *string    `json:"location"`
	Metadata     JSONMap    `json:"metadata" gorm:"type:jsonb"`
	ArchivedAt   *time.Time `json:"archived_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	Part         *Part      `json:"part,omitempty" gorm:"foreignKey:PartID"`
	// The active installation of this item in another, with parent_item loaded
	Parent *ItemComponent `json:"parent,omitempty" gorm:"foreignKey:ComponentItemID"`
}
type ItemComponent struct {
	ID              uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey"`
	ParentItemID    uuid.UUID      `json:"parent_item_id"`
	ComponentItemID uuid.UUID      `json:"component_item_id"`
	PartComponentID uuid.UUID      `json:"part_component_id"`
	Position        *string        `json:"position"`
	InstalledAt     time.Time      `json:"installed_at"`
	RemovedAt       *time.Time     `json:"removed_at"`
	BOMSnapshot     JSONMap        `json:"bom_snapshot" gorm:"type:jsonb"`
	ComponentItem   *InventoryItem `json:"component_item,omitempty" gorm:"foreignKey:ComponentItemID"`
	ParentItem      *InventoryItem `json:"parent_item,omitempty" gorm:"foreignKey:ParentItemID"`
}
type PartDetail struct {
	Part
	Components []PartComponent `json:"components"`
	Parents    []PartComponent `json:"parents"`
}
type ItemDetail struct {
	InventoryItem
	Components []ItemComponent `json:"components"`
	History    []ItemComponent `json:"history"`
}
type TreeNode struct {
	Item      InventoryItem `json:"item"`
	Children  []TreeNode    `json:"children"`
	Truncated bool          `json:"truncated,omitempty"`
}
type Filter struct {
	Search          string
	PartID          *uuid.UUID
	IncludeArchived bool
	// Available: not installed in any item
	Available bool
	// Sort orders parts: newest (default), name, items, available_items
	Sort   string
	Limit  int
	Offset int
}
type Page[T any] struct {
	Data   []T   `json:"data"`
	Total  int64 `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}
type Summary struct {
	Parts          int64 `json:"parts"`
	Items          int64 `json:"items"`
	InstalledItems int64 `json:"installed_items"`
	RootItems      int64 `json:"root_items"`
}
