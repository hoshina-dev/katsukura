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
	"github.com/hoshina-dev/papi2/schema"
	"log/slog"
	"math"
	"slices"
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
	CreateItems(context.Context, uuid.UUID, int, []string) ([]models.InventoryItem, error)
	CreateComponent(context.Context, uuid.UUID, *models.PartComponent) error
	Replace(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (*models.ItemComponent, error)
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
	var details []apperrors.Detail
	var e *apperrors.Error
	var f *fiber.Error
	if errors.As(err, &e) {
		status, code, message, details = e.Status, e.Code, e.Message, e.Details
	} else if errors.As(err, &f) {
		status = f.Code
		code = "http_error"
		message = f.Message
	}
	if status >= 500 {
		slog.Error("HTTP request failed", "method", c.Method(), "path", c.Path(), "error", err)
	}
	body := fiber.Map{"code": code, "message": message}
	if len(details) > 0 {
		body["details"] = details
	}
	return c.Status(status).JSON(fiber.Map{"error": body})
}
func id(c *fiber.Ctx, key string) (uuid.UUID, error) {
	v, e := uuid.Parse(c.Params(key))
	if e != nil {
		return uuid.Nil, apperrors.Invalid("Invalid " + key)
	}
	return v, nil
}

// reply sends v as JSON with status, or the error when e is set.
func reply(c *fiber.Ctx, status int, v any, e error) error {
	if e != nil {
		return e
	}
	return c.Status(status).JSON(v)
}

// done replies 204, or the error when e is set.
func done(c *fiber.Ctx, e error) error {
	if e != nil {
		return e
	}
	return c.SendStatus(204)
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
func flag(c *fiber.Ctx, key string) (bool, error) {
	switch c.Query(key, "false") {
	case "true":
		return true, nil
	case "false":
		return false, nil
	}
	return false, apperrors.Invalid("Invalid " + key)
}
func filter(c *fiber.Ctx) (f models.Filter, e error) {
	f.Search = c.Query("search")
	if f.Limit, e = number(c, "limit", 50, 200); e != nil || f.Limit == 0 {
		return f, apperrors.Invalid("limit must be between 1 and 200")
	}
	if f.Offset, e = number(c, "offset", 0, math.MaxInt); e != nil {
		return
	}
	if f.IncludeArchived, e = flag(c, "include_archived"); e != nil {
		return
	}
	if f.Available, e = flag(c, "available"); e != nil {
		return
	}
	switch f.Sort = c.Query("sort"); f.Sort {
	case "", "newest", "name", "items", "available_items":
	default:
		return f, apperrors.Invalid("sort must be newest, name, items or available_items")
	}
	if raw := c.Query("part_id"); raw != "" {
		v, e := uuid.Parse(raw)
		if e != nil {
			return f, apperrors.Invalid("Invalid part_id")
		}
		f.PartID = &v
	}
	return f, nil
}

// object decodes a JSON object body into target, numbers kept exact.
func object(c *fiber.Ctx, target any) error {
	if strings.ToLower(strings.TrimSpace(strings.Split(c.Get("Content-Type"), ";")[0])) != "application/json" {
		return &apperrors.Error{Status: 415, Code: "unsupported_media_type", Message: "Content-Type must be application/json"}
	}
	return services.DecodeObject(c.Body(), target)
}

// body decodes a create body, rejecting keys outside allowed.
func body(c *fiber.Ctx, target any, allowed ...string) error {
	var m map[string]json.RawMessage
	if e := object(c, &m); e != nil {
		return e
	}
	for k, v := range m {
		if !slices.Contains(allowed, k) {
			return apperrors.Invalid("Unknown field: " + k)
		}
		if k == "metadata" && (len(v) == 0 || v[0] != '{') {
			return apperrors.Invalid("metadata must be an object")
		}
	}
	return services.DecodeObject(c.Body(), target)
}

func (h *Handler) ListParts(c *fiber.Ctx) error {
	f, e := filter(c)
	if e != nil {
		return e
	}
	v, e := h.api.Parts(c.UserContext(), f)
	return reply(c, 200, v, e)
}
func (h *Handler) ListItems(c *fiber.Ctx) error {
	f, e := filter(c)
	if e != nil {
		return e
	}
	v, e := h.api.Items(c.UserContext(), f)
	return reply(c, 200, v, e)
}
func (h *Handler) Summary(c *fiber.Ctx) error {
	v, e := h.api.Summary(c.UserContext())
	return reply(c, 200, v, e)
}
func (h *Handler) Part(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	v, e := h.api.Part(c.UserContext(), i)
	return reply(c, 200, v, e)
}
func (h *Handler) Item(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	v, e := h.api.Item(c.UserContext(), i)
	return reply(c, 200, v, e)
}
func (h *Handler) MetadataSchema(c *fiber.Ctx) error {
	c.Type("json")
	return c.Send(schema.MetadataJSON)
}
func (h *Handler) ValidateMetadata(c *fiber.Ctx) error {
	var m map[string]any
	if e := object(c, &m); e != nil {
		return e
	}
	v, e := services.NewMetadata(m)
	return reply(c, 200, v, e)
}
func (h *Handler) CreatePart(c *fiber.Ctx) error {
	v := new(models.Part)
	if e := body(c, v, "sku", "name", "description", "metadata"); e != nil {
		return e
	}
	return reply(c, 201, v, h.api.CreatePart(c.UserContext(), v))
}
func (h *Handler) CreateItem(c *fiber.Ctx) error {
	v := new(models.InventoryItem)
	if e := body(c, v, "part_id", "serial_number", "metadata"); e != nil {
		return e
	}
	return reply(c, 201, v, h.api.CreateItem(c.UserContext(), v))
}
func (h *Handler) CreateItems(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	var v struct {
		Count         int      `json:"count"`
		SerialNumbers []string `json:"serial_numbers"`
	}
	if e := body(c, &v, "count", "serial_numbers"); e != nil {
		return e
	}
	items, e := h.api.CreateItems(c.UserContext(), i, v.Count, v.SerialNumbers)
	return reply(c, 201, fiber.Map{"data": items}, e)
}
func (h *Handler) CreateComponent(c *fiber.Ctx) error {
	v := new(models.PartComponent)
	if e := body(c, v, "child_part_id", "slot", "required_quantity"); e != nil {
		return e
	}
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	return reply(c, 201, v, h.api.CreateComponent(c.UserContext(), i, v))
}
func (h *Handler) Replace(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	j, e := id(c, "installationID")
	if e != nil {
		return e
	}
	var v struct {
		ComponentItemID uuid.UUID `json:"component_item_id"`
	}
	if e := body(c, &v, "component_item_id"); e != nil {
		return e
	}
	if v.ComponentItemID == uuid.Nil {
		return apperrors.Invalid("component_item_id is required")
	}
	installation, e := h.api.Replace(c.UserContext(), i, j, v.ComponentItemID)
	return reply(c, 201, installation, e)
}
func (h *Handler) PatchPart(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	var p map[string]any
	if e := object(c, &p); e != nil {
		return e
	}
	v, e := h.api.UpdatePart(c.UserContext(), i, p)
	return reply(c, 200, v, e)
}
func (h *Handler) PatchItem(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	var p map[string]any
	if e := object(c, &p); e != nil {
		return e
	}
	v, e := h.api.UpdateItem(c.UserContext(), i, p)
	return reply(c, 200, v, e)
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
	var p map[string]any
	if e := object(c, &p); e != nil {
		return e
	}
	v, e := h.api.UpdateComponent(c.UserContext(), i, j, p)
	return reply(c, 200, v, e)
}
func (h *Handler) ArchivePart(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	return done(c, h.api.ArchivePart(c.UserContext(), i))
}
func (h *Handler) ArchiveItem(c *fiber.Ctx) error {
	i, e := id(c, "id")
	if e != nil {
		return e
	}
	return done(c, h.api.ArchiveItem(c.UserContext(), i))
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
	return done(c, h.api.DeleteComponent(c.UserContext(), i, j))
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
	return reply(c, 200, v, e)
}
