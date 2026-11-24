package models

import (
	"bytes"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"regexp"
	"strings"
	"time"
)

// Money is a non-negative amount with at most two decimal places, sent in JSON
// as a decimal string such as "12.50". Stored leaf/override columns are
// numeric(14,2); resolved BOM totals may be larger.
type Money string

// ZeroMoney is the default composite price for every new part.
const ZeroMoney Money = "0.00"

// MaxStoredMoney is the largest value numeric(14,2) can hold (12 digits before
// the decimal point). Create/PATCH of stored prices must not exceed this;
// resolved BOM totals may.
const MaxStoredMoney Money = "999999999999.99"

var moneyPattern = regexp.MustCompile(`^\d+(\.\d{1,2})?$`)

// MoneyFrom parses a JSON string or number into Money (resolved totals allowed).
func MoneyFrom(v any) (Money, error) {
	switch x := v.(type) {
	case Money:
		return ParseMoney(string(x))
	case string:
		return ParseMoney(x)
	case json.Number:
		return ParseMoney(string(x))
	default:
		return "", fmt.Errorf("invalid money")
	}
}

// StoredMoneyFrom parses a value that will be written to a numeric(14,2) column.
func StoredMoneyFrom(v any) (Money, error) {
	m, err := MoneyFrom(v)
	if err != nil {
		return "", err
	}
	return EnforceStoredMoney(m)
}

// ParseMoney accepts a non-negative decimal with at most two fraction digits
// and normalizes it to two places ("12" -> "12.00").
func ParseMoney(s string) (Money, error) {
	s = strings.TrimSpace(s)
	if !moneyPattern.MatchString(s) {
		return "", fmt.Errorf("invalid money")
	}
	whole, frac, _ := strings.Cut(s, ".")
	whole = strings.TrimLeft(whole, "0")
	if whole == "" {
		whole = "0"
	}
	if frac == "" {
		frac = "00"
	} else if len(frac) == 1 {
		frac += "0"
	}
	return Money(whole + "." + frac), nil
}

// EnforceStoredMoney rejects amounts that cannot fit in numeric(14,2).
func EnforceStoredMoney(m Money) (Money, error) {
	whole, _, _ := strings.Cut(string(m), ".")
	if len(whole) > 12 {
		return "", fmt.Errorf("exceeds stored money limit")
	}
	return m, nil
}

func (m Money) String() string { return string(m) }

func (m Money) Value() (driver.Value, error) {
	if m == "" {
		return string(ZeroMoney), nil
	}
	return string(m), nil
}

func (m *Money) Scan(v any) error {
	if m == nil {
		return fmt.Errorf("nil Money")
	}
	if v == nil {
		*m = ZeroMoney
		return nil
	}
	var s string
	switch x := v.(type) {
	case []byte:
		s = string(x)
	case string:
		s = x
	default:
		return fmt.Errorf("invalid money value %T", v)
	}
	parsed, err := ParseMoney(s)
	if err != nil {
		return err
	}
	*m = parsed
	return nil
}

func (m Money) MarshalJSON() ([]byte, error) {
	if m == "" {
		return json.Marshal(string(ZeroMoney))
	}
	return json.Marshal(string(m))
}

func (m *Money) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		return fmt.Errorf("money cannot be null")
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		parsed, err := ParseMoney(s)
		if err != nil {
			return err
		}
		*m = parsed
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(b, &n); err == nil {
		parsed, err := ParseMoney(string(n))
		if err != nil {
			return err
		}
		*m = parsed
		return nil
	}
	return fmt.Errorf("invalid money")
}

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
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	SKU         string    `json:"sku"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	Metadata    JSONMap   `json:"metadata" gorm:"type:jsonb"`
	// Whether items of this SKU get serial numbers. Pointer so an omitted
	// create field does not become false under GORM's zero-value write.
	SerialAware *bool `json:"serial_aware"`
	// Stored leaf price (0 for assemblies); overwritten with the resolved
	// part_composite_price() value on read responses.
	CompositePrice Money `json:"composite_price" gorm:"type:numeric(14,2);not null;default:0"`
	// Optional override; null means the effective price is the composite price.
	UnitPrice *Money `json:"unit_price" gorm:"type:numeric(14,2)"`
	// unit_price when set, otherwise the resolved composite price.
	EffectiveUnitPrice Money      `json:"effective_unit_price" gorm:"-"`
	ArchivedAt         *time.Time `json:"archived_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	// Counts of the part's items; filled on part lists and details
	Stock *Stock `json:"stock,omitempty" gorm:"-"`
	// Number of BOM rows; filled on part lists and details
	ComponentCount *int64 `json:"component_count,omitempty" gorm:"-"`
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
type BOMGraph struct {
	Units []BOMUnit `json:"units"`
	Slots []BOMSlot `json:"slots"`
}
type BOMUnit struct {
	ID         uuid.UUID  `json:"id"`
	SKU        string     `json:"sku"`
	Name       string     `json:"name"`
	ArchivedAt *time.Time `json:"archived_at"`
}
type BOMSlot struct {
	ID               uuid.UUID `json:"id"`
	ParentPartID     uuid.UUID `json:"parent_part_id"`
	ChildPartID      uuid.UUID `json:"child_part_id"`
	Slot             string    `json:"slot"`
	RequiredQuantity int       `json:"required_quantity"`
}
type InventoryItem struct {
	ID           uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	PartID       uuid.UUID  `json:"part_id"`
	SerialNumber *string    `json:"serial_number"`
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
	HasBOM          bool
	Catalog         CatalogFilters
	// Available: not installed in any item
	Available bool
	Sort      string
	Order     string
	Limit     int
	Offset    int
}
type CatalogFilters struct {
	Category, Manufacturer, CountryOfOrigin, TemperatureStage string
	Stock, Tracking                                           string
	UnitType, BOMEditing                                      string
}
type CatalogFacets map[string][]string
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
