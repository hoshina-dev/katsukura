package storage

import (
	"bytes"
	"context"
	"fmt"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/hoshina-dev/katsukura/internal/config"
)

// Store uploads part images to an S3-compatible bucket (Cloudflare R2).
type Store struct {
	client    *s3.Client
	bucket    string
	publicURL string
}

func New(cfg config.S3Config) *Store {
	client := s3.New(s3.Options{
		Region:       cfg.Region,
		BaseEndpoint: aws.String(cfg.Endpoint),
		Credentials:  credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		UsePathStyle: true,
		// Default checksum headers are rejected by R2.
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	return &Store{client: client, bucket: cfg.Bucket, publicURL: cfg.PublicURL}
}

func (s *Store) UploadImage(ctx context.Context, filename, contentType string, data []byte) (string, error) {
	ext, ok := imageExt[contentType]
	if !ok {
		return "", fmt.Errorf("unsupported image type %s", contentType)
	}
	key := fmt.Sprintf("part-image/%s_%d_%s%s", safeName(filename), time.Now().UnixMilli(), uuid.NewString()[:8], ext)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	return s.publicURL + "/" + key, nil
}

var imageExt = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func safeName(filename string) string {
	base := path.Base(strings.ReplaceAll(filename, "\\", "/"))
	base = strings.TrimSuffix(base, path.Ext(base))
	var b strings.Builder
	for _, r := range base {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	name := strings.Trim(b.String(), "._")
	if name == "" {
		return "image"
	}
	if len(name) > 80 {
		name = name[:80]
	}
	return name
}
