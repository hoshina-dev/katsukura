package services

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/hoshina-dev/katsukura/internal/models"
	"github.com/hoshina-dev/katsukura/schema"
	"regexp"
	"strings"
	"testing"
)

func TestPatchPreservesNullFalseAndZeroRules(t *testing.T) {
	p := map[string]any{"serial_number": nil, "description": "  ", "metadata": schema.WithDefaults(nil), "archived_at": nil}
	if e := validatePatch(p, "serial_number description metadata archived_at"); e != nil {
		t.Fatal(e)
	}
	if p["description"] != nil || p["serial_number"] != nil {
		t.Fatal("nullable fields not cleared")
	}
	if _, ok := p["metadata"].(models.JSONMap); !ok {
		t.Fatal("metadata not converted to database JSON")
	}
	b := map[string]any{"required_quantity": float64(1)}
	if e := validatePatch(b, "required_quantity"); e != nil {
		t.Fatal(e)
	}
	if b["required_quantity"] != 1 {
		t.Fatal("quantity not converted")
	}
}
func TestNewMetadataFillsDefaults(t *testing.T) {
	m, e := NewMetadata(nil)
	if e != nil || len(m) != 7 || m["notes"] != nil || m["specification"] == nil {
		t.Fatalf("got %v %v", m, e)
	}
	if _, e = NewMetadata(map[string]any{"specification": nil}); e == nil {
		t.Fatal("accepted null specification")
	}
}
func TestInvalidPatch(t *testing.T) {
	for _, p := range []map[string]any{{"metadata": nil}, {"metadata": map[string]any{"image_url": "x"}}, {"metadata": map[string]any{"category": "x"}}, {"archived_at": "2026-01-01"}, {"part_id": "immutable"}, {"required_quantity": float64(1.5)}, {"required_quantity": float64(0)}, {"name": "  "}, {"composite_price": "-1"}, {"composite_price": "1.234"}, {"unit_price": "abc"}} {
		if e := validatePatch(p, "metadata archived_at required_quantity name composite_price unit_price"); e == nil {
			t.Fatalf("accepted invalid patch %v", p)
		}
	}
}
func TestPricePatch(t *testing.T) {
	p := map[string]any{"composite_price": nil, "unit_price": "12.5"}
	if e := validatePatch(p, "composite_price unit_price"); e != nil {
		t.Fatal(e)
	}
	if p["composite_price"] != models.ZeroMoney {
		t.Fatalf("null composite_price: %v", p["composite_price"])
	}
	if p["unit_price"] != models.Money("12.50") {
		t.Fatalf("unit_price: %v", p["unit_price"])
	}
	clear := map[string]any{"unit_price": nil}
	if e := validatePatch(clear, "unit_price"); e != nil || clear["unit_price"] != nil {
		t.Fatalf("clear unit_price: %v %v", clear, e)
	}
	for _, over := range []map[string]any{
		{"composite_price": "1000000000000.00"},
		{"unit_price": "1000000000000"},
	} {
		if e := validatePatch(over, "composite_price unit_price"); e == nil {
			t.Fatalf("accepted oversize stored price %v", over)
		}
	}
	max := map[string]any{"composite_price": string(models.MaxStoredMoney)}
	if e := validatePatch(max, "composite_price"); e != nil {
		t.Fatal(e)
	}
}
func TestDecodeObject(t *testing.T) {
	for _, body := range []string{"null", "[]", "42", "bad"} {
		var m map[string]any
		if e := DecodeObject([]byte(body), &m); e == nil {
			t.Fatalf("accepted %s", body)
		}
	}
}
func TestDecodeMetadataPreservesLargeInteger(t *testing.T) {
	var m map[string]any
	if e := DecodeObject([]byte(`{"metadata":{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":9007199254740993,"image_urls":null,"specification":{}}}`), &m); e != nil {
		t.Fatal(e)
	}
	if e := validatePatch(m, "metadata"); e != nil {
		t.Fatal(e)
	}
	value, e := m["metadata"].(models.JSONMap).Value()
	if e != nil || !strings.Contains(value.(string), `"temperature_stage":9007199254740993`) {
		t.Fatalf("large number changed: %v %v", value, e)
	}
}

type parentUsageStore struct {
	Store
	parentError error
}

func (s *parentUsageStore) Read(ctx context.Context, fn func(Store) error) error { return fn(s) }
func (s *parentUsageStore) GetPart(context.Context, uuid.UUID) (*models.Part, error) {
	return &models.Part{}, nil
}
func (s *parentUsageStore) Stock(context.Context, []uuid.UUID) (map[uuid.UUID]models.Stock, error) {
	return nil, nil
}
func (s *parentUsageStore) ComponentCounts(context.Context, []uuid.UUID) (map[uuid.UUID]int64, error) {
	return nil, nil
}
func (s *parentUsageStore) ResolvePrices(_ context.Context, parts []models.Part) error {
	for i := range parts {
		if parts[i].CompositePrice == "" {
			parts[i].CompositePrice = models.ZeroMoney
		}
		if parts[i].UnitPrice != nil {
			parts[i].EffectiveUnitPrice = *parts[i].UnitPrice
		} else {
			parts[i].EffectiveUnitPrice = parts[i].CompositePrice
		}
	}
	return nil
}
func (s *parentUsageStore) Components(context.Context, uuid.UUID) ([]models.PartComponent, error) {
	return []models.PartComponent{}, nil
}
func (s *parentUsageStore) ParentComponents(context.Context, uuid.UUID) ([]models.PartComponent, error) {
	return nil, s.parentError
}
func TestPartParentQueryErrorAndEmptyContract(t *testing.T) {
	store := &parentUsageStore{}
	part, e := New(store).Part(context.Background(), uuid.New())
	if e != nil || part.Parents == nil {
		t.Fatalf("nil parents leaked: %+v %v", part, e)
	}
	store.parentError = errors.New("parent query failed")
	part, e = New(store).Part(context.Background(), uuid.New())
	if e != store.parentError || part != nil {
		t.Fatalf("parent query error lost: %+v %v", part, e)
	}
}

func TestGeneratedIdentifiers(t *testing.T) {
	sku, serial := regexp.MustCompile(`^RF-[0-9A-F]{8}$`), regexp.MustCompile(`^RF-SN-\d{12}$`)
	for i := 0; i < 100; i++ {
		if s := newSKU(); !sku.MatchString(s) {
			t.Fatalf("SKU %q", s)
		}
		if s := newSerialNumber(); !serial.MatchString(s) {
			t.Fatalf("serial %q", s)
		}
	}
}
