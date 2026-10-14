package config

import (
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != 8082 || !cfg.Migrate || cfg.ShutdownTimeout != 10*time.Second || cfg.DataSourceName == "" {
		t.Fatalf("unexpected defaults: %#v", cfg)
	}
}

func TestLoadOverridesAndDSNPrecedence(t *testing.T) {
	values := map[string]string{
		"PORT": "9000", "DATA_SOURCE_NAME": "primary", "DATABASE_URL": "fallback",
		"AUTO_MIGRATE": "false", "SHUTDOWN_TIMEOUT": "3s",
	}
	cfg, err := Load(func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != 9000 || cfg.DataSourceName != "primary" || cfg.Migrate || cfg.ShutdownTimeout != 3*time.Second {
		t.Fatalf("overrides not applied: %#v", cfg)
	}
	delete(values, "DATA_SOURCE_NAME")
	cfg, err = Load(func(key string) string { return values[key] })
	if err != nil || cfg.DataSourceName != "fallback" {
		t.Fatalf("DATABASE_URL fallback: %#v, %v", cfg, err)
	}
}

func TestLoadRejectsInvalidSettings(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"PORT", "abc"}, {"PORT", "0"}, {"PORT", "65536"},
		{"AUTO_MIGRATE", "sometimes"}, {"SHUTDOWN_TIMEOUT", "bad"}, {"SHUTDOWN_TIMEOUT", "0s"},
	} {
		t.Run(tc.key+"="+tc.value, func(t *testing.T) {
			_, err := Load(func(key string) string {
				if key == tc.key {
					return tc.value
				}
				return ""
			})
			if err == nil {
				t.Fatal("expected configuration error")
			}
		})
	}
}
