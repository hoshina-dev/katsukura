package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/hoshina-dev/papi2/internal/apperrors"
	"github.com/hoshina-dev/papi2/internal/models"
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
func (s *Service) CreatePart(ctx context.Context, p *models.Part) error {
	if strings.TrimSpace(p.SKU) == "" || strings.TrimSpace(p.Name) == "" {
		return apperrors.Invalid("sku and name are required")
	}
	p.SKU = strings.TrimSpace(p.SKU)
	p.Name = strings.TrimSpace(p.Name)
	p.Description = trimNullable(p.Description)
	p.ID = uuid.New()
	p.ArchivedAt = nil
	if p.Metadata == nil {
		p.Metadata = models.JSONMap{}
	}
	return s.write(ctx, func(r Store) error { return r.Create(ctx, p) })
}
func (s *Service) CreateItem(ctx context.Context, i *models.InventoryItem) error {
	if i.PartID == uuid.Nil {
		return apperrors.Invalid("part_id is required")
	}
	if i.AssemblyState == "" {
		i.AssemblyState = "draft"
	}
	if i.AssemblyState != "draft" && i.AssemblyState != "complete" {
		return apperrors.Invalid("Invalid assembly_state")
	}
	i.SerialNumber = trimNullable(i.SerialNumber)
	i.Location = trimNullable(i.Location)
	i.ID = uuid.New()
	i.ArchivedAt = nil
	if i.Metadata == nil {
		i.Metadata = models.JSONMap{}
	}
	return s.write(ctx, func(r Store) error {
		if _, e := r.GetPart(ctx, i.PartID); e != nil {
			return e
		}
		return r.Create(ctx, i)
	})
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
		return r.Create(ctx, c)
	})
}
func (s *Service) Install(ctx context.Context, parent uuid.UUID, i *models.ItemComponent) error {
	if i.ComponentItemID == uuid.Nil || i.PartComponentID == uuid.Nil {
		return apperrors.Invalid("component_item_id and part_component_id are required")
	}
	i.ID = uuid.New()
	i.ParentItemID = parent
	i.Position = trimNullable(i.Position)
	i.InstalledAt = time.Now().UTC()
	i.RemovedAt = nil
	i.BOMSnapshot = models.JSONMap{}
	return s.write(ctx, func(r Store) error {
		p, e := r.GetItem(ctx, parent)
		if e != nil {
			return e
		}
		child, e := r.GetItem(ctx, i.ComponentItemID)
		if e != nil {
			return e
		}
		slot, e := r.GetComponent(ctx, i.PartComponentID)
		if e != nil {
			return e
		}
		if slot.ParentPartID != p.PartID || slot.ChildPartID != child.PartID {
			return &apperrors.Error{Status: 409, Code: "slot_mismatch", Message: "Items must match the exact parent and child SKUs of this BOM slot"}
		}
		if e = r.Create(ctx, i); e != nil {
			return e
		}
		fresh, e := r.GetInstallation(ctx, i.ID)
		if e != nil {
			return e
		}
		*i = *fresh
		return nil
	})
}
func (s *Service) Remove(ctx context.Context, parent, id uuid.UUID) error {
	return s.write(ctx, func(r Store) error {
		i, e := r.GetInstallation(ctx, id)
		if e != nil {
			return e
		}
		if i.ParentItemID != parent {
			return apperrors.NotFound()
		}
		if i.RemovedAt != nil {
			return nil
		}
		return r.Remove(ctx, parent, id)
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
func (s *Service) ArchiveItem(ctx context.Context, id uuid.UUID) error {
	return s.write(ctx, func(r Store) error {
		if _, e := r.GetItem(ctx, id); e != nil {
			return e
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
	if e = validatePatch(p, "serial_number assembly_state location metadata archived_at"); e != nil {
		return
	}
	e = s.write(ctx, func(r Store) error {
		if _, e := r.GetItem(ctx, id); e != nil {
			return e
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
	if e = validatePatch(p, "slot required_quantity is_optional child_part_id"); e != nil {
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
		case "is_optional":
			if _, ok := v.(bool); !ok {
				return apperrors.Invalid("is_optional must be boolean")
			}
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
			if k == "assembly_state" && t != "draft" && t != "complete" {
				return apperrors.Invalid("Invalid assembly_state")
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
