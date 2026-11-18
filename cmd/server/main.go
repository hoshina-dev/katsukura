package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/hoshina-dev/katsukura/internal/config"
	"github.com/hoshina-dev/katsukura/internal/database"
	"github.com/hoshina-dev/katsukura/internal/handlers"
	"github.com/hoshina-dev/katsukura/internal/repositories"
	"github.com/hoshina-dev/katsukura/internal/routes"
	"github.com/hoshina-dev/katsukura/internal/services"
	"github.com/hoshina-dev/katsukura/internal/storage"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("load .env: %w", err)
	}
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := database.Connect(cfg.DataSourceName)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	pool, err := db.DB()
	if err != nil {
		return err
	}
	defer pool.Close()
	pool.SetMaxOpenConns(20)
	pool.SetMaxIdleConns(5)
	pool.SetConnMaxLifetime(30 * time.Minute)
	if cfg.Migrate {
		migrationCtx, cancel := context.WithTimeout(ctx, time.Minute)
		err = database.Migrate(migrationCtx, db)
		cancel()
		if err != nil {
			return fmt.Errorf("migrate database: %w", err)
		}
	}
	if cfg.StaticDir != "" {
		info, statErr := os.Stat(cfg.StaticDir)
		if statErr != nil || !info.IsDir() {
			if statErr == nil {
				statErr = fmt.Errorf("not a directory")
			}
			return fmt.Errorf("STATIC_DIR %s: %w", cfg.StaticDir, statErr)
		}
	}
	var images handlers.ImageStore
	if cfg.S3.Bucket != "" {
		images = storage.New(cfg.S3)
	}
	service := services.New(repositories.New(db))
	app := routes.New(service, pool.PingContext, routes.Options{StaticDir: cfg.StaticDir, Images: images})
	serverErrors := make(chan error, 1)
	addr := fmt.Sprintf(":%d", cfg.Port)
	go func() {
		slog.Info("server listening", "address", addr)
		serverErrors <- app.Listen(addr)
	}()
	select {
	case err := <-serverErrors:
		return err
	case <-ctx.Done():
		stop()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		slog.Info("server shutting down")
		return app.ShutdownWithContext(shutdownCtx)
	}
}
