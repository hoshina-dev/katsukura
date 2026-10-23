package services

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/hoshina-dev/papi2/internal/apperrors"
	"github.com/hoshina-dev/papi2/internal/models"
	"github.com/hoshina-dev/papi2/schema"
	"math/big"
	"strconv"
	"strings"
	"time"
)

type Service struct{ repo Store }

func New(r Store) *Service { return &Service{r} }
func (s *Service) write(ctx context.Context, fn func(Store) error) error {
	return apperrors.Translate(s.repo.WithLock(ctx, fn))
}
func (s *Service) readParts(ctx context.Context, f models.Filter) (models.Page[models.Part], error) {
	v, e := s.repo.Parts(ctx, f)
	return v, apperrors.Translate(e)
}
func (s *Service) readItems(ctx context.Context, f models.Filter) (models.Page[models.InventoryItem], error) {
	v, e := s.repo.Items(ctx, f)
	return v, apperrors.Translate(e)
}
func (s *Service) Summary(ctx context.Context) (models.Summary, error) {
	var v models.Summary
	var e error
	e = s.repo.Read(ctx, func(r Store) error { v, e = r.Summary(ctx); return e })
	return v, e
}
func (s *Service) readPart(ctx context.Context, id uuid.UUID) (*models.PartDetail, error) {
	p, e := s.repo.GetPart(ctx, id)
	if e != nil {
		return nil, apperrors.Translate(e)
	}
	c, e := s.repo.Components(ctx, id)
	if e != nil {
		return nil, e
	}
	parents, e := s.repo.ParentComponents(ctx, id)
	if e != nil {
		return nil, e
	}
	if parents == nil {
		parents = []models.PartComponent{}
	}
	return &models.PartDetail{Part: *p, Components: c, Parents: parents}, nil
}
func (s *Service) readComponents(ctx context.Context, id uuid.UUID) ([]models.PartComponent, error) {
	if _, e := s.repo.GetPart(ctx, id); e != nil {
		return nil, apperrors.Translate(e)
	}
	return s.repo.Components(ctx, id)
}
func (s *Service) readItem(ctx context.Context, id uuid.UUID) (*models.ItemDetail, error) {
	i, e := s.repo.GetItem(ctx, id)
	if e != nil {
		return nil, apperrors.Translate(e)
	}
	p, e := s.repo.Parent(ctx, id)
	if e != nil {
		return nil, e
	}
	c, e := s.repo.Installations(ctx, id, true)
	if e != nil {
		return nil, e
	}
	h, e := s.repo.Installations(ctx, id, false)
	return &models.ItemDetail{InventoryItem: *i, Parent: p, Components: c, History: h}, e
}

// MaxNewItems caps how many items one CreateItems call may add.
const MaxNewItems = 1000

// newSKU returns "RF-" plus 8 random hex digits, used when a part has no SKU.
func newSKU() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "RF-" + strings.ToUpper(hex.EncodeToString(b))
}

// newSerialNumber returns "RF-SN-" plus 12 random digits.
func newSerialNumber() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(9e11))
	return fmt.Sprintf("RF-SN-%d", n.Int64()+1e11)
}

func (s *Service) CreatePart(ctx context.Context, p *models.Part) error {
	if strings.TrimSpace(p.Name) == "" {
		return apperrors.Invalid("name is required")
	}
	p.SKU = strings.TrimSpace(p.SKU)
	if p.SKU == "" {
		p.SKU = newSKU()
	}
	p.Name = strings.TrimSpace(p.Name)
	p.Description = trimNullable(p.Description)
	p.ID = uuid.New()
	p.ArchivedAt = nil
	if p.Metadata == nil {
		p.Metadata = models.JSONMap{}
	}
	if e := ValidateMetadata(p.Metadata); e != nil {
		return e
	}
	return s.write(ctx, func(r Store) error { return r.Create(ctx, p) })
}
func (s *Service) CreateItem(ctx context.Context, i *models.InventoryItem) error {
	if i.PartID == uuid.Nil {
		return apperrors.Invalid("part_id is required")
	}
	i.SerialNumber = trimNullable(i.SerialNumber)
	i.Location = trimNullable(i.Location)
	i.ID = uuid.New()
	i.ArchivedAt = nil
	if i.Metadata == nil {
		i.Metadata = models.JSONMap{}
	}
	if e := ValidateMetadata(i.Metadata); e != nil {
		return e
	}
	return s.write(ctx, func(r Store) error {
		if _, e := r.GetPart(ctx, i.PartID); e != nil {
			return e
		}
		return build(ctx, r, i.PartID, []*models.InventoryItem{i})
	})
}

// CreateItems adds count items of one part in a single transaction. Each item
// gets a generated serial number and a copy of the part's metadata.
func (s *Service) CreateItems(ctx context.Context, partID uuid.UUID, count int) ([]models.InventoryItem, error) {
	if count < 1 || count > MaxNewItems {
		return nil, apperrors.Invalid(fmt.Sprintf("count must be between 1 and %d", MaxNewItems))
	}
	items := make([]*models.InventoryItem, count)
	e := s.write(ctx, func(r Store) error {
		p, e := r.GetPart(ctx, partID)
		if e != nil {
			return e
		}
		for i := range items {
			serial := newSerialNumber()
			items[i] = &models.InventoryItem{ID: uuid.New(), PartID: partID, SerialNumber: &serial, Metadata: p.Metadata}
		}
		return build(ctx, r, partID, items)
	})
	if e != nil {
		return nil, e
	}
	v := make([]models.InventoryItem, count)
	for i, item := range items {
		v[i] = *item
	}
	return v, nil
}

// build creates items of a part and fills every BOM slot from available
// stock, so a composite item is complete from the start. It fails before
// writing anything when stock is short.
func build(ctx context.Context, r Store, partID uuid.UUID, items []*models.InventoryItem) error {
	slots, e := r.Components(ctx, partID)
	if e != nil {
		return e
	}
	need := map[uuid.UUID]int{}
	for _, slot := range slots {
		need[slot.ChildPartID] += slot.RequiredQuantity * len(items)
	}
	for _, slot := range slots {
		n, ok := need[slot.ChildPartID]
		if !ok {
			continue
		}
		delete(need, slot.ChildPartID)
		stock, e := r.Items(ctx, models.Filter{PartID: &slot.ChildPartID, Available: true, Limit: 1})
		if e != nil {
			return e
		}
		if stock.Total < int64(n) {
			return apperrors.Conflict(fmt.Sprintf("Not enough %s (%s) in stock: need %d, have %d", slot.ChildPart.Name, slot.ChildPart.SKU, n, stock.Total))
		}
	}
	for _, item := range items {
		if e := r.Create(ctx, item); e != nil {
			return e
		}
		for _, slot := range slots {
			stock, e := r.Items(ctx, models.Filter{PartID: &slot.ChildPartID, Available: true, Limit: slot.RequiredQuantity})
			if e != nil {
				return e
			}
			for _, child := range stock.Data {
				if e := r.Create(ctx, newInstallation(item.ID, child.ID, slot.ID)); e != nil {
					return e
				}
			}
		}
	}
	return nil
}

func newInstallation(parent, child, slot uuid.UUID) *models.ItemComponent {
	return &models.ItemComponent{ID: uuid.New(), ParentItemID: parent, ComponentItemID: child, PartComponentID: slot, InstalledAt: time.Now().UTC(), BOMSnapshot: models.JSONMap{}}
}

// Replace swaps the item in an active installation for another available item
// of the same SKU. The old item returns to stock; history keeps both.
func (s *Service) Replace(ctx context.Context, parent, installation, child uuid.UUID) (v *models.ItemComponent, e error) {
	e = s.write(ctx, func(r Store) error {
		old, e := r.GetInstallation(ctx, installation)
		if e != nil {
			return e
		}
		if old.ParentItemID != parent || old.RemovedAt != nil {
			return apperrors.NotFound()
		}
		item, e := r.GetItem(ctx, child)
		if e != nil {
			return e
		}
		slot, e := r.GetComponent(ctx, old.PartComponentID)
		if e != nil {
			return e
		}
		if item.PartID != slot.ChildPartID {
			return &apperrors.Error{Status: 409, Code: "slot_mismatch", Message: "Items must match the exact parent and child SKUs of this BOM slot"}
		}
		if e := r.Remove(ctx, parent, installation); e != nil {
			return e
		}
		next := newInstallation(parent, child, old.PartComponentID)
		if e := r.Create(ctx, next); e != nil {
			return e
		}
		v, e = r.GetInstallation(ctx, next.ID)
		return e
	})
	return
}

// bomLocked rejects BOM changes while the part has items: they were built to
// the current BOM and must keep matching it.
func bomLocked(ctx context.Context, r Store, partID uuid.UUID) error {
	items, e := r.Items(ctx, models.Filter{PartID: &partID, Limit: 1})
	if e != nil {
		return e
	}
	if items.Total > 0 {
		return apperrors.Conflict("The BOM cannot change while this SKU has items in inventory")
	}
	return nil
}
func (s *Service) CreateComponent(ctx context.Context, parent uuid.UUID, c *models.PartComponent) error {
	if c.ChildPartID == uuid.Nil || strings.TrimSpace(c.Slot) == "" || (c.RequiredQuantity < 1 || c.RequiredQuantity > 2147483647) {
		return apperrors.Invalid("child_part_id, slot, and positive required_quantity are required")
	}
	c.Slot = strings.TrimSpace(c.Slot)
	c.ID = uuid.New()
	c.ParentPartID = parent
	return s.write(ctx, func(r Store) error {
		if _, e := r.GetPart(ctx, parent); e != nil {
			return e
		}
		if _, e := r.GetPart(ctx, c.ChildPartID); e != nil {
			return e
		}
		if e := bomLocked(ctx, r, parent); e != nil {
			return e
		}
		return r.Create(ctx, c)
	})
}
func (s *Service) DeleteComponent(ctx context.Context, parent, id uuid.UUID) error {
	return s.write(ctx, func(r Store) error {
		c, e := r.GetComponent(ctx, id)
		if e != nil {
			return e
		}
		if c.ParentPartID != parent {
			return apperrors.NotFound()
		}
		if e := bomLocked(ctx, r, parent); e != nil {
			return e
		}
		return r.DeleteComponent(ctx, id)
	})
}
func (s *Service) ArchivePart(ctx context.Context, id uuid.UUID) error {
	return s.write(ctx, func(r Store) error {
		if _, e := r.GetPart(ctx, id); e != nil {
			return e
		}
		return r.Archive(ctx, &models.Part{}, id)
	})
}

// ArchiveItem deletes an item. A composite item releases its components back
// to stock in the same transaction; an installed item must be released first.
func (s *Service) ArchiveItem(ctx context.Context, id uuid.UUID) error {
	return s.write(ctx, func(r Store) error {
		if _, e := r.GetItem(ctx, id); e != nil {
			return e
		}
		active, e := r.Installations(ctx, id, true)
		if e != nil {
			return e
		}
		for _, c := range active {
			if e := r.Remove(ctx, id, c.ID); e != nil {
				return e
			}
		}
		return r.Archive(ctx, &models.InventoryItem{}, id)
	})
}
func (s *Service) UpdatePart(ctx context.Context, id uuid.UUID, p map[string]any) (v *models.Part, e error) {
	if e = validatePatch(p, "sku name description metadata archived_at"); e != nil {
		return
	}
	e = s.write(ctx, func(r Store) error {
		if _, e := r.GetPart(ctx, id); e != nil {
			return e
		}
		if e := r.Update(ctx, &models.Part{}, id, p); e != nil {
			return e
		}
		v, e = r.GetPart(ctx, id)
		return e
	})
	return
}
func (s *Service) UpdateItem(ctx context.Context, id uuid.UUID, p map[string]any) (v *models.InventoryItem, e error) {
	if e = validatePatch(p, "serial_number location metadata archived_at"); e != nil {
		return
	}
	e = s.write(ctx, func(r Store) error {
		i, e := r.GetItem(ctx, id)
		if e != nil {
			return e
		}
		// A deleted composite gave its components back, so it stays deleted
		if _, restore := p["archived_at"]; restore && i.ArchivedAt != nil {
			slots, e := r.Components(ctx, i.PartID)
			if e != nil {
				return e
			}
			if len(slots) > 0 {
				return apperrors.Conflict("A deleted composite item cannot be restored; add a new one instead")
			}
		}
		if e := r.Update(ctx, &models.InventoryItem{}, id, p); e != nil {
			return e
		}
		v, e = r.GetItem(ctx, id)
		return e
	})
	return
}
func (s *Service) UpdateComponent(ctx context.Context, parent, id uuid.UUID, p map[string]any) (v *models.PartComponent, e error) {
	if e = validatePatch(p, "slot required_quantity child_part_id"); e != nil {
		return
	}
	e = s.write(ctx, func(r Store) error {
		c, e := r.GetComponent(ctx, id)
		if e != nil {
			return e
		}
		if c.ParentPartID != parent {
			return apperrors.NotFound()
		}
		if child, ok := p["child_part_id"].(string); ok {
			if _, e := r.GetPart(ctx, uuid.MustParse(child)); e != nil {
				return e
			}
		}
		if e := bomLocked(ctx, r, parent); e != nil {
			return e
		}
		if e = r.Update(ctx, &models.PartComponent{}, id, p); e != nil {
			return e
		}
		v, e = r.GetComponent(ctx, id)
		return e
	})
	return
}
func (s *Service) PatchPart(ctx context.Context, id uuid.UUID, p map[string]any) error {
	_, e := s.UpdatePart(ctx, id, p)
	return e
}
func (s *Service) PatchItem(ctx context.Context, id uuid.UUID, p map[string]any) error {
	_, e := s.UpdateItem(ctx, id, p)
	return e
}
func (s *Service) PatchComponent(ctx context.Context, parent, id uuid.UUID, p map[string]any) error {
	_, e := s.UpdateComponent(ctx, parent, id, p)
	return e
}
func validatePatch(p map[string]any, allowed string) error {
	for k, v := range p {
		if !strings.Contains(" "+allowed+" ", " "+k+" ") {
			return apperrors.Invalid("Field is not editable: " + k)
		}
		switch k {
		case "archived_at":
			if v != nil {
				return apperrors.Invalid("archived_at can only be null to restore")
			}
		case "metadata":
			m, ok := v.(map[string]any)
			if !ok {
				return apperrors.Invalid("metadata must be an object")
			}
			if e := ValidateMetadata(m); e != nil {
				return e
			}
			p[k] = models.JSONMap(m)
		case "required_quantity":
			var n int64
			var err error
			switch x := v.(type) {
			case json.Number:
				n, err = strconv.ParseInt(string(x), 10, 32)
			case float64:
				if x != float64(int64(x)) {
					err = fmt.Errorf("fractional")
				} else {
					n = int64(x)
				}
			default:
				err = fmt.Errorf("invalid number")
			}
			if err != nil || n < 1 || n > 2147483647 {
				return apperrors.Invalid("required_quantity must be a positive integer")
			}
			p[k] = int(n)
		case "description", "serial_number", "location":
			if v != nil {
				if t, ok := v.(string); !ok {
					return apperrors.Invalid(k + " must be a string or null")
				} else {
					t = strings.TrimSpace(t)
					if (k == "serial_number" || k == "location" || k == "description") && t == "" {
						p[k] = nil
					} else {
						p[k] = t
					}
				}
			}
		default:
			t, ok := v.(string)
			if !ok || strings.TrimSpace(t) == "" {
				return apperrors.Invalid(k + " must be a nonempty string")
			}
			t = strings.TrimSpace(t)
			p[k] = t
			if k == "child_part_id" {
				if _, e := uuid.Parse(t); e != nil {
					return apperrors.Invalid("Invalid child_part_id")
				}
			}
		}
	}
	return nil
}
func (s *Service) readTree(ctx context.Context, id uuid.UUID, depth int) (*models.TreeNode, error) {
	if depth < 0 || depth > 100 {
		return nil, apperrors.Invalid("depth must be between 0 and 100")
	}
	v, e := s.repo.Tree(ctx, id, depth)
	return v, apperrors.Translate(e)
}

// ValidateMetadata checks metadata against schema/metadata.schema.json and
// reports each invalid key in the error details.
func ValidateMetadata(m map[string]any) error {
	e := schema.ValidateMetadata(m)
	var se *schema.Error
	if !errors.As(e, &se) {
		return e
	}
	details := make([]apperrors.Detail, len(se.Fields))
	for i, f := range se.Fields {
		details[i] = apperrors.Detail{Field: f.Field, Message: f.Message}
	}
	return &apperrors.Error{Status: 400, Code: "invalid_request", Message: se.Error(), Details: details}
}
func DecodeObject(body []byte, target any) error {
	var p map[string]json.RawMessage
	if e := json.Unmarshal(body, &p); e != nil || p == nil {
		return apperrors.Invalid("Body must be a JSON object")
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	if e := dec.Decode(target); e != nil {
		return apperrors.Invalid("Invalid JSON body")
	}
	return nil
}

func (s *Service) Parts(ctx context.Context, f models.Filter) (v models.Page[models.Part], e error) {
	e = s.repo.Read(ctx, func(r Store) error { v, e = New(r).readParts(ctx, f); return e })
	return
}
func (s *Service) Items(ctx context.Context, f models.Filter) (v models.Page[models.InventoryItem], e error) {
	e = s.repo.Read(ctx, func(r Store) error { v, e = New(r).readItems(ctx, f); return e })
	return
}
func (s *Service) Part(ctx context.Context, id uuid.UUID) (v *models.PartDetail, e error) {
	e = s.repo.Read(ctx, func(r Store) error { v, e = New(r).readPart(ctx, id); return e })
	return
}

func (s *Service) Item(ctx context.Context, id uuid.UUID) (v *models.ItemDetail, e error) {
	e = s.repo.Read(ctx, func(r Store) error { v, e = New(r).readItem(ctx, id); return e })
	return
}
func (s *Service) Components(ctx context.Context, id uuid.UUID) (v []models.PartComponent, e error) {
	e = s.repo.Read(ctx, func(r Store) error { v, e = New(r).readComponents(ctx, id); return e })
	return
}
func (s *Service) Tree(ctx context.Context, id uuid.UUID, depth int) (v *models.TreeNode, e error) {
	e = s.repo.Read(ctx, func(r Store) error { v, e = New(r).readTree(ctx, id, depth); return e })
	return
}

func trimNullable(p *string) *string {
	if p == nil {
		return nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return nil
	}
	return &s
}
