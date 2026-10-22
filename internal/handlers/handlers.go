package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/hoshina-dev/papi2/internal/apperrors"
	"github.com/hoshina-dev/papi2/internal/models"
	"github.com/hoshina-dev/papi2/internal/services"
	"log/slog"
	"strconv"
	"strings"
)

type API interface {
	Parts(context.Context, models.Filter) (models.Page[models.Part], error)
	Items(context.Context, models.Filter) (models.Page[models.InventoryItem], error)
	Summary(context.Context) (models.Summary, error)
	Part(context.Context, uuid.UUID) (*models.PartDetail, error)
	Item(context.Context, uuid.UUID) (*models.ItemDetail, error)
	Components(context.Context, uuid.UUID) ([]models.PartComponent, error)
	CreatePart(context.Context, *models.Part) error
	CreateItem(context.Context, *models.InventoryItem) error
	CreateComponent(context.Context, uuid.UUID, *models.PartComponent) error
	Install(context.Context, uuid.UUID, *models.ItemComponent) error
	Remove(context.Context, uuid.UUID, uuid.UUID) error
	DeleteComponent(context.Context, uuid.UUID, uuid.UUID) error
	ArchivePart(context.Context, uuid.UUID) error
	ArchiveItem(context.Context, uuid.UUID) error
	UpdatePart(context.Context, uuid.UUID, map[string]any) (*models.Part, error)
	UpdateItem(context.Context, uuid.UUID, map[string]any) (*models.InventoryItem, error)
	UpdateComponent(context.Context, uuid.UUID, uuid.UUID, map[string]any) (*models.PartComponent, error)
	Tree(context.Context, uuid.UUID, int) (*models.TreeNode, error)
}
type Handler struct{ api API }

func New(a API) *Handler { return &Handler{a} }
func ErrorHandler(c *fiber.Ctx, err error) error {
	err = apperrors.Translate(err)
	status := 500
	code, message := "internal_error", "Internal server error"
	var e *apperrors.Error
	var f *fiber.Error
	if errors.As(err, &e) {
		status, code, message = e.Status, e.Code, e.Message
	} else if errors.As(err, &f) {
		status = f.Code
		code = "http_error"
		message = f.Message
	}
	if status >= 500 {
		slog.Error("HTTP request failed", "method", c.Method(), "path", c.Path(), "error", err)
	}
	return c.Status(status).JSON(fiber.Map{"error": fiber.Map{"code": code, "message": message}})
}
func id(c *fiber.Ctx, key string) (uuid.UUID, error) {
	v, e := uuid.Parse(c.Params(key))
	if e != nil {
		return uuid.Nil, apperrors.Invalid("Invalid " + key)
	}
	return v, nil
}
func number(c *fiber.Ctx, key string, def, max int) (int, error) {
	raw := c.Query(key)
	if raw == "" {
		return def, nil
	}
	v, e := strconv.Atoi(raw)
	if e != nil || v < 0 || v > max {
		return 0, apperrors.Invalid("Invalid " + key)
	}
	return v, nil
}
func filter(c *fiber.Ctx) (models.Filter, error) {
	f := models.Filter{Search: c.Query("search")}
	var e error
	f.Limit, e = number(c, "limit", 50, 200)
	if e != nil || f.Limit == 0 {
		return f, apperrors.Invalid("limit must be between 1 and 200")
	}
	f.Offset, e = number(c, "offset", 0, int(^uint(0)>>1))
	if e != nil {
		return f, e
	}
	raw := c.Query("include_archived", "false")
	if raw != "true" && raw != "false" {
		return f, apperrors.Invalid("Invalid include_archived")
	}
	f.IncludeArchived = raw == "true"
	if raw = c.Query("part_id"); raw != "" {
		v, e := uuid.Parse(raw)
		if e != nil {
			return f, apperrors.Invalid("Invalid part_id")
		}
		f.PartID = &v
	}
	return f, nil
}
func requireJSON(c *fiber.Ctx) error {
	if strings.ToLower(strings.TrimSpace(strings.Split(c.Get("Content-Type"), ";")[0])) != "application/json" {
		return &apperrors.Error{Status: 415, Code: "unsupported_media_type", Message: "Content-Type must be application/json"}
	}
	return nil
}
func body(c *fiber.Ctx, target any, allowed string) error {
	if e := requireJSON(c); e != nil {
		return e
	}
	if e := services.DecodeObject(c.Body(), target); e != nil {
		return e
	}
	var m map[string]json.RawMessage
	_ = json.Unmarshal(c.Body(), &m)
	for k, v := range m {
		valid := false
		for _, a := range strings.Fields(allowed) {
			if k == a {
				valid = true
				break
			}
		}
		if !valid {
			return apperrors.Invalid("Unknown field: " + k)
		}
		if k == "metadata" && (string(v) == "null" || len(v) == 0 || v[0] != '{') {
			return apperrors.Invalid("metadata must be an object")
		}
	}
	return nil
}

func (h *Handler) ListParts(c *fiber.Ctx) error {
	f, e := filter(c)
	if e != nil {
		return e
	}
	v, e := h.api.Parts(c.UserContext(), f)
	if e != nil {
		return e
	}
	return c.JSON(v)
}

func (h *Handler) ListItems(c *fiber.Ctx) error {
	f, e := filter(c)
	if e != nil {
		return e
	}
	v, e := h.api.Items(c.UserContext(), f)
	if e != nil {
		return e
	}
	return c.JSON(v)
}
func (h *Handler) Summary(c *fiber.Ctx) error {
	v, e := h.api.Summary(c.UserContext())
	if e != nil {
		return e
	}
	return c.JSON(v)
}
func (h *Handler) Part(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	v, e := h.api.Part(c.UserContext(), i)
	if e != nil {
		return e
	}
	return c.JSON(v)
}
func (h *Handler) Item(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	v, e := h.api.Item(c.UserContext(), i)
	if e != nil {
		return e
	}
	return c.JSON(v)
}
func (h *Handler) ValidateMetadata(c *fiber.Ctx) error {
	if e := requireJSON(c); e != nil {
		return e
	}
	var m map[string]any
	if e := services.DecodeObject(c.Body(), &m); e != nil {
		return e
	}
	if e := services.ValidateMetadata(m); e != nil {
		return e
	}
	return c.JSON(m)
}
func (h *Handler) CreatePart(c *fiber.Ctx) error {
	v := new(models.Part)
	if e := body(c, v, "sku name description metadata"); e != nil {
		return e
	}
	if e := h.api.CreatePart(c.UserContext(), v); e != nil {
		return e
	}
	return c.Status(201).JSON(v)
}
func (h *Handler) CreateItem(c *fiber.Ctx) error {
	v := new(models.InventoryItem)
	if e := body(c, v, "part_id serial_number assembly_state location metadata"); e != nil {
		return e
	}
	if e := h.api.CreateItem(c.UserContext(), v); e != nil {
		return e
	}
	return c.Status(201).JSON(v)
}
func (h *Handler) CreateComponent(c *fiber.Ctx) error {
	v := new(models.PartComponent)
	if e := body(c, v, "child_part_id slot required_quantity is_optional"); e != nil {
		return e
	}
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	if e := h.api.CreateComponent(c.UserContext(), i, v); e != nil {
		return e
	}
	return c.Status(201).JSON(v)
}
func (h *Handler) Install(c *fiber.Ctx) error {
	v := new(models.ItemComponent)
	if e := body(c, v, "component_item_id part_component_id position"); e != nil {
		return e
	}
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	if e := h.api.Install(c.UserContext(), i, v); e != nil {
		return e
	}
	return c.Status(201).JSON(v)
}
func (h *Handler) PatchPart(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	if e := requireJSON(c); e != nil {
		return e
	}
	var p map[string]any
	if e := services.DecodeObject(c.Body(), &p); e != nil {
		return e
	}
	v, e := h.api.UpdatePart(c.UserContext(), i, p)
	if e != nil {
		return e
	}
	return c.JSON(v)
}
func (h *Handler) PatchItem(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	if e := requireJSON(c); e != nil {
		return e
	}
	var p map[string]any
	if e := services.DecodeObject(c.Body(), &p); e != nil {
		return e
	}
	v, e := h.api.UpdateItem(c.UserContext(), i, p)
	if e != nil {
		return e
	}
	return c.JSON(v)
}
func (h *Handler) PatchComponent(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	j, e := id(c, "componentID")
	if e != nil {
		return e
	}
	if e := requireJSON(c); e != nil {
		return e
	}
	var p map[string]any
	if e := services.DecodeObject(c.Body(), &p); e != nil {
		return e
	}
	v, e := h.api.UpdateComponent(c.UserContext(), i, j, p)
	if e != nil {
		return e
	}
	return c.JSON(v)
}
func (h *Handler) ArchivePart(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	if e := h.api.ArchivePart(c.UserContext(), i); e != nil {
		return e
	}
	return c.SendStatus(204)
}
func (h *Handler) ArchiveItem(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	if e := h.api.ArchiveItem(c.UserContext(), i); e != nil {
		return e
	}
	return c.SendStatus(204)
}
func (h *Handler) DeleteComponent(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	j, e := id(c, "componentID")
	if e != nil {
		return e
	}
	if e := h.api.DeleteComponent(c.UserContext(), i, j); e != nil {
		return e
	}
	return c.SendStatus(204)
}
func (h *Handler) Remove(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	j, e := id(c, "installationID")
	if e != nil {
		return e
	}
	if e := h.api.Remove(c.UserContext(), i, j); e != nil {
		return e
	}
	return c.SendStatus(204)
}
func (h *Handler) Components(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	f, e := filter(c)
	if e != nil {
		return e
	}
	v, e := h.api.Components(c.UserContext(), i)
	if e != nil {
		return e
	}
	total := len(v)
	start := min(f.Offset, total)
	end := min(start+f.Limit, total)
	return c.JSON(models.Page[models.PartComponent]{Data: v[start:end], Total: int64(total), Limit: f.Limit, Offset: f.Offset})
}
func (h *Handler) Tree(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	d, e := number(c, "depth", 20, 100)
	if e != nil {
		return e
	}
	v, e := h.api.Tree(c.UserContext(), i, d)
	if e != nil {
		return e
	}
	return c.JSON(v)
}
