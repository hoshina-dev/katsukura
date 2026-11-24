package routes

import (
	"context"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/hoshina-dev/katsukura/internal/handlers"
)

type Options struct {
	// StaticDir serves the built backoffice. Empty keeps the API-only 404s.
	StaticDir string
	Images    handlers.ImageStore
}

func NewApp(api handlers.API, ready func(context.Context) error) *fiber.App {
	return New(api, ready, Options{})
}

func New(api handlers.API, ready func(context.Context) error, opts Options) *fiber.App {
	// One cropped part image is at most 1 MB; allow multipart overhead.
	app := fiber.New(fiber.Config{ErrorHandler: handlers.ErrorHandler, BodyLimit: 2 * 1024 * 1024})
	app.Use(recover.New())
	h := handlers.New(api)
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	app.Get("/readyz", func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()
		if ready == nil || ready(ctx) != nil {
			return c.Status(503).JSON(fiber.Map{"error": fiber.Map{"code": "not_ready", "message": "Database unavailable"}})
		}
		return c.JSON(fiber.Map{"status": "ok"})
	})
	v := app.Group("/api/v1")
	v.Get("/summary", h.Summary)
	v.Get("/bom/graph", h.BOMGraph)
	v.Get("/metadata/schema", h.MetadataSchema)
	v.Post("/metadata/validate", h.ValidateMetadata)
	v.Post("/uploads", handlers.UploadImage(opts.Images))
	p := v.Group("/parts")
	p.Get("/", h.ListParts)
	p.Get("/filters", h.CatalogFacets)
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
	if opts.StaticDir != "" {
		mountStatic(app, opts.StaticDir)
	} else {
		app.Use(func(c *fiber.Ctx) error { return fiber.ErrNotFound })
	}
	return app
}

// mountStatic serves built UI files and falls back to index.html for app routes.
func mountStatic(app *fiber.App, dir string) {
	root, err := filepath.Abs(dir)
	if err != nil {
		app.Use(func(c *fiber.Ctx) error { return fiber.ErrNotFound })
		return
	}
	app.Use(func(c *fiber.Ctx) error {
		if c.Method() != fiber.MethodGet && c.Method() != fiber.MethodHead {
			return fiber.ErrNotFound
		}
		p := c.Path()
		if p == "/healthz" || p == "/readyz" || p == "/api" || strings.HasPrefix(p, "/api/") {
			return fiber.ErrNotFound
		}
		rel := strings.TrimPrefix(path.Clean("/"+p), "/")
		if rel == "." {
			rel = ""
		}
		if rel != "" {
			full := filepath.Join(root, filepath.FromSlash(rel))
			fromRoot, relErr := filepath.Rel(root, full)
			if relErr != nil || strings.HasPrefix(fromRoot, "..") {
				return fiber.ErrNotFound
			}
			info, statErr := os.Stat(full)
			if statErr == nil && !info.IsDir() {
				if strings.HasPrefix(p, "/assets/") {
					c.Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				return c.SendFile(full)
			}
			if strings.Contains(filepath.Base(rel), ".") {
				return fiber.ErrNotFound
			}
		}
		c.Set("Cache-Control", "no-cache")
		return c.SendFile(filepath.Join(root, "index.html"))
	})
}
