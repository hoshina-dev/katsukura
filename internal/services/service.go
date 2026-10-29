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
	"math"
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

// read runs fn in a read-only transaction and translates its error.
func read[T any](ctx context.Context, s *Service, fn func(Store) (T, error)) (v T, e error) {
	e = s.repo.Read(ctx, func(r Store) error { v, e = fn(r); return e })
	return v, apperrors.Translate(e)
}
func (s *Service) Parts(ctx context.Context, f models.Filter) (models.Page[models.Part], error) {
	return read(ctx, s, func(r Store) (models.Page[models.Part], error) {
		page, e := r.Parts(ctx, f)
		if e != nil {
			return page, e
		}
		return page, withStock(ctx, r, page.Data)
	})
}

// withStock fills each part's item counts.
func withStock(ctx context.Context, r Store, parts []models.Part) error {
	ids := make([]uuid.UUID, len(parts))
	for i, p := range parts {
		ids[i] = p.ID
	}
	stock, e := r.Stock(ctx, ids)
	for i, p := range parts {
		v := stock[p.ID]
		parts[i].Stock = &v
	}
	return e
}
func (s *Service) Items(ctx context.Context, f models.Filter) (models.Page[models.InventoryItem], error) {
	return read(ctx, s, func(r Store) (models.Page[models.InventoryItem], error) { return r.Items(ctx, f) })
}
func (s *Service) Summary(ctx context.Context) (models.Summary, error) {
	return read(ctx, s, func(r Store) (models.Summary, error) { return r.Summary(ctx) })
}
func (s *Service) Part(ctx context.Context, id uuid.UUID) (*models.PartDetail, error) {
	return read(ctx, s, func(r Store) (*models.PartDetail, error) {
		p, e := r.GetPart(ctx, id)
		if e != nil {
			return nil, e
		}
		part := []models.Part{*p}
		if e := withStock(ctx, r, part); e != nil {
			return nil, e
		}
		c, e := r.Components(ctx, id)
		if e != nil {
			return nil, e
		}
		parents, e := r.ParentComponents(ctx, id)
		if e != nil {
			return nil, e
		}
		if parents == nil {
			parents = []models.PartComponent{}
		}
		return &models.PartDetail{Part: part[0], Components: c, Parents: parents}, nil
	})
}
func (s *Service) Components(ctx context.Context, id uuid.UUID) ([]models.PartComponent, error) {
	return read(ctx, s, func(r Store) ([]models.PartComponent, error) {
		if _, e := r.GetPart(ctx, id); e != nil {
			return nil, e
		}
		return r.Components(ctx, id)
	})
}
func (s *Service) Item(ctx context.Context, id uuid.UUID) (*models.ItemDetail, error) {
	return read(ctx, s, func(r Store) (*models.ItemDetail, error) {
		i, e := r.GetItem(ctx, id)
		if e != nil {
			return nil, e
		}
		c, e := r.Installations(ctx, id, true)
		if e != nil {
			return nil, e
		}
		h, e := r.Installations(ctx, id, false)
		return &models.ItemDetail{InventoryItem: *i, Components: c, History: h}, e
	})
}
func (s *Service) Tree(ctx context.Context, id uuid.UUID, depth int) (*models.TreeNode, error) {
	if depth < 0 || depth > 100 {
		return nil, apperrors.Invalid("depth must be between 0 and 100")
	}
	return read(ctx, s, func(r Store) (*models.TreeNode, error) { return r.Tree(ctx, id, depth) })
}

// MaxNewItems caps how many items one CreateItems call may add.
const MaxNewItems = 1000

// maxQuantity is the largest BOM quantity the database column holds.
const maxQuantity = math.MaxInt32

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
	var e error
	if p.Metadata, e = NewMetadata(p.Metadata); e != nil {
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
	var e error
	if i.Metadata, e = NewMetadata(i.Metadata); e != nil {
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
// stock, so a composite item is complete from the start. It writes nothing
// when stock is short.
func build(ctx context.Context, r Store, partID uuid.UUID, items []*models.InventoryItem) error {
	slots, e := r.Components(ctx, partID)
	if e != nil {
		return e
	}
	need := map[uuid.UUID]int{}
	for _, slot := range slots {
		need[slot.ChildPartID] += slot.RequiredQuantity * len(items)
	}
	stock := map[uuid.UUID][]uuid.UUID{}
	for _, slot := range slots {
		child := slot.ChildPartID
		if _, done := stock[child]; done {
			continue
		}
		ids, e := r.AvailableItems(ctx, child, need[child])
		if e != nil {
			return e
		}
		if len(ids) < need[child] {
			return apperrors.Conflict(fmt.Sprintf("Not enough %s (%s) in stock: need %d, have %d", slot.ChildPart.Name, slot.ChildPart.SKU, need[child], len(ids)))
		}
		stock[child] = ids
	}
	installs := []*models.ItemComponent{}
	for _, item := range items {
		for _, slot := range slots {
			ids := stock[slot.ChildPartID]
			for _, child := range ids[:slot.RequiredQuantity] {
				installs = append(installs, newInstallation(item.ID, child, slot.ID, nil))
			}
			stock[slot.ChildPartID] = ids[slot.RequiredQuantity:]
		}
	}
	if e := r.Create(ctx, items); e != nil || len(installs) == 0 {
		return e
	}
	return r.Create(ctx, installs)
}

func newInstallation(parent, child, slot uuid.UUID, position *string) *models.ItemComponent {
	return &models.ItemComponent{ID: uuid.New(), ParentItemID: parent, ComponentItemID: child, PartComponentID: slot, Position: position, InstalledAt: time.Now().UTC(), BOMSnapshot: models.JSONMap{}}
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
		next := newInstallation(parent, child, old.PartComponentID, old.Position)
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
	locked, e := r.HasItems(ctx, partID)
	if e != nil {
		return e
	}
	if locked {
		return apperrors.Conflict("The BOM cannot change while this SKU has items in inventory")
	}
	return nil
}
func (s *Service) CreateComponent(ctx context.Context, parent uuid.UUID, c *models.PartComponent) error {
	if c.ChildPartID == uuid.Nil || strings.TrimSpace(c.Slot) == "" || c.RequiredQuantity < 1 || c.RequiredQuantity > maxQuantity {
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

// ArchivePart deletes a part together with all its items. The database
// rejects it while any of those items is installed elsewhere or the part is
// in another active BOM.
func (s *Service) ArchivePart(ctx context.Context, id uuid.UUID) error {
	return s.write(ctx, func(r Store) error {
		p, e := r.GetPart(ctx, id)
		if e != nil {
			return e
		}
		// Installed items always belong to such a BOM, so this names the blocker
		uses, e := r.ParentComponents(ctx, id)
		if e != nil {
			return e
		}
		for _, use := range uses {
			if use.ParentPart != nil && use.ParentPart.ArchivedAt == nil {
				return apperrors.Conflict(fmt.Sprintf("%s is used in the BOM of %s; remove it there first", p.Name, use.ParentPart.Name))
			}
		}
		if e := r.ArchivePartItems(ctx, id); e != nil {
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
			if err != nil || n < 1 || n > maxQuantity {
				return apperrors.Invalid("required_quantity must be a positive integer")
			}
			p[k] = int(n)
		case "description", "serial_number", "location":
			if v == nil {
				continue
			}
			t, ok := v.(string)
			if !ok {
				return apperrors.Invalid(k + " must be a string or null")
			}
			if t = strings.TrimSpace(t); t == "" {
				p[k] = nil
			} else {
				p[k] = t
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

// NewMetadata fills fields missing from m with their schema defaults and
// validates the result; it is the metadata a create stores.
func NewMetadata(m map[string]any) (models.JSONMap, error) {
	full := schema.WithDefaults(m)
	return full, ValidateMetadata(full)
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
