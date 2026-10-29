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

	"github.com/hoshina-dev/papi2/internal/config"
	"github.com/hoshina-dev/papi2/internal/database"
	"github.com/hoshina-dev/papi2/internal/repositories"
	"github.com/hoshina-dev/papi2/internal/routes"
	"github.com/hoshina-dev/papi2/internal/services"
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
	service := services.New(repositories.New(db))
	app := routes.NewApp(service, pool.PingContext)
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
