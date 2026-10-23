package routes

import (
	"context"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/hoshina-dev/papi2/internal/handlers"
)

func NewApp(api handlers.API, ready func(context.Context) error) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: handlers.ErrorHandler, BodyLimit: 1024 * 1024})
	app.Use(recover.New())
	h := handlers.New(api)
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	app.Get("/readyz", func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 5_000_000_000)
		defer cancel()
		if ready == nil || ready(ctx) != nil {
			return c.Status(503).JSON(fiber.Map{"error": fiber.Map{"code": "not_ready", "message": "Database unavailable"}})
		}
		return c.JSON(fiber.Map{"status": "ok"})
	})
	v := app.Group("/api/v1")
	v.Get("/summary", h.Summary)
	v.Get("/metadata/schema", h.MetadataSchema)
	v.Post("/metadata/validate", h.ValidateMetadata)
	p := v.Group("/parts")
	p.Get("/", h.ListParts)
	p.Post("/", h.CreatePart)
	p.Get("/:id", h.Part)
	p.Patch("/:id", h.PatchPart)
	p.Delete("/:id", h.ArchivePart)
	p.Get("/:id/components", h.Components)
	p.Post("/:id/components", h.CreateComponent)
	p.Post("/:id/items", h.CreateItems)
	p.Patch("/:id/components/:componentID", h.PatchComponent)
	p.Delete("/:id/components/:componentID", h.DeleteComponent)
	i := v.Group("/inventory")
	i.Get("/", h.ListItems)
	i.Post("/", h.CreateItem)
	i.Get("/:id", h.Item)
	i.Patch("/:id", h.PatchItem)
	i.Delete("/:id", h.ArchiveItem)
	i.Get("/:id/tree", h.Tree)
	i.Post("/:id/components/:installationID/replace", h.Replace)
	app.Use(func(c *fiber.Ctx) error { return fiber.ErrNotFound })
	return app
}
