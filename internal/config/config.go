package config

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port            int
	DataSourceName  string
	Migrate         bool
	ShutdownTimeout time.Duration
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:            8082,
		DataSourceName:  "postgres://papi2:papi2@localhost:5438/papi2?sslmode=disable",
		Migrate:         true,
		ShutdownTimeout: 10 * time.Second,
	}
	if v := strings.TrimSpace(getenv("PORT")); v != "" {
		port, err := strconv.Atoi(v)
		if err != nil || port < 1 || port > 65535 {
			return Config{}, fmt.Errorf("PORT must be an integer between 1 and 65535")
		}
		cfg.Port = port
	}
	if v := strings.TrimSpace(getenv("DATA_SOURCE_NAME")); v != "" {
		cfg.DataSourceName = v
	} else if v := strings.TrimSpace(getenv("DATABASE_URL")); v != "" {
		cfg.DataSourceName = v
	}
	if v := strings.TrimSpace(getenv("AUTO_MIGRATE")); v != "" {
		value, err := strconv.ParseBool(v)
		if err != nil {
			return Config{}, fmt.Errorf("AUTO_MIGRATE must be a boolean")
		}
		cfg.Migrate = value
	}
	if v := strings.TrimSpace(getenv("SHUTDOWN_TIMEOUT")); v != "" {
		duration, err := time.ParseDuration(v)
		if err != nil || duration <= 0 {
			return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT must be a positive duration")
		}
		cfg.ShutdownTimeout = duration
	}
	return cfg, nil
}
