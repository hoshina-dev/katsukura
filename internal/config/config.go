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
	// StaticDir is the built backoffice. Empty serves the API only.
	StaticDir string
	S3        S3Config
}

// S3Config is optional. A bucket enables part-image upload.
type S3Config struct {
	Endpoint  string
	PublicURL string
	AccessKey string
	SecretKey string
	Bucket    string
	Region    string
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:            8082,
		DataSourceName:  "postgres://katsukura:katsukura@localhost:5438/katsukura?sslmode=disable",
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
	cfg.StaticDir = strings.TrimSpace(getenv("STATIC_DIR"))
	cfg.S3 = S3Config{
		Endpoint:  strings.TrimRight(strings.TrimSpace(getenv("S3_ENDPOINT")), "/"),
		PublicURL: strings.TrimRight(strings.TrimSpace(getenv("S3_PUBLIC_URL")), "/"),
		AccessKey: strings.TrimSpace(getenv("S3_ACCESS_KEY")),
		SecretKey: strings.TrimSpace(getenv("S3_SECRET_KEY")),
		Bucket:    strings.TrimSpace(getenv("S3_BUCKET_NAME")),
		Region:    strings.TrimSpace(getenv("S3_REGION")),
	}
	if cfg.S3.Bucket != "" {
		if cfg.S3.Endpoint == "" || cfg.S3.AccessKey == "" || cfg.S3.SecretKey == "" {
			return Config{}, fmt.Errorf("S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY are required when S3_BUCKET_NAME is set")
		}
		if cfg.S3.Region == "" {
			cfg.S3.Region = "auto"
		}
		if cfg.S3.PublicURL == "" {
			cfg.S3.PublicURL = cfg.S3.Endpoint
		}
	}
	return cfg, nil
}
