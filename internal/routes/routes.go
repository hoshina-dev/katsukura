package routes

import (
	"context"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/hoshina-dev/papi2/internal/handlers"
	"io/fs"
	"mime"
	"path"
	"strings"
)

func NewApp(api handlers.API, ready func(context.Context) error, assets fs.FS) *fiber.App {
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
	p := v.Group("/parts")
	p.Get("/", h.ListParts)
	p.Post("/", h.CreatePart)
	p.Get("/:id", h.Part)
	p.Patch("/:id", h.PatchPart)
	p.Delete("/:id", h.ArchivePart)
	p.Get("/:id/components", h.Components)
	p.Post("/:id/components", h.CreateComponent)
	p.Patch("/:id/components/:componentID", h.PatchComponent)
	p.Delete("/:id/components/:componentID", h.DeleteComponent)
	i := v.Group("/inventory")
	i.Get("/", h.ListItems)
	i.Post("/", h.CreateItem)
	i.Get("/:id", h.Item)
	i.Patch("/:id", h.PatchItem)
	i.Delete("/:id", h.ArchiveItem)
	i.Get("/:id/tree", h.Tree)
	i.Post("/:id/components", h.Install)
	i.Delete("/:id/components/:installationID", h.Remove)
	app.Use(func(c *fiber.Ctx) error {
		p := c.Path()
		reserved := strings.ToLower(p)
		if reserved == "/api" || strings.HasPrefix(reserved, "/api/") || strings.HasPrefix(reserved, "/healthz") || strings.HasPrefix(reserved, "/readyz") {
			return fiber.ErrNotFound
		}
		if (c.Method() != fiber.MethodGet && c.Method() != fiber.MethodHead) || assets == nil {
			return fiber.ErrNotFound
		}
		name := strings.TrimPrefix(path.Clean(p), "/")
		if name == "." || name == "" {
			name = "index.html"
		}
		if name != "index.html" && !strings.HasPrefix(name, "assets/") && name != "favicon.ico" && name != "robots.txt" {
			if path.Ext(name) != "" {
				return fiber.ErrNotFound
			}
			name = "index.html"
		}
		if strings.Contains(name, "/.") || strings.HasPrefix(name, ".") {
			return fiber.ErrNotFound
		}
		b, e := fs.ReadFile(assets, name)
		if e != nil {
			if path.Ext(name) != "" {
				return fiber.ErrNotFound
			}
			name = "index.html"
			b, e = fs.ReadFile(assets, name)
			if e != nil {
				return fiber.ErrNotFound
			}
		}
		if name == "index.html" {
			c.Set("Cache-Control", "no-cache")
		} else if strings.HasPrefix(name, "assets/") {
			c.Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		if t := mime.TypeByExtension(path.Ext(name)); t != "" {
			c.Set("Content-Type", t)
		}
		return c.Send(b)
	})
	return app
}
