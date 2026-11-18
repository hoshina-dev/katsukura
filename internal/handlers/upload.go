package handlers

import (
	"context"
	"io"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/hoshina-dev/katsukura/internal/apperrors"
)

const maxImageBytes = 1 << 20

var imageTypes = map[string]struct{}{
	"image/jpeg": {},
	"image/png":  {},
	"image/webp": {},
}

// ImageStore saves a part image and returns its public URL.
type ImageStore interface {
	UploadImage(ctx context.Context, filename, contentType string, data []byte) (string, error)
}

// UploadImage accepts one multipart file field named "file".
func UploadImage(store ImageStore) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if store == nil {
			return &apperrors.Error{Status: 503, Code: "storage_unconfigured", Message: "Image storage is not configured"}
		}
		file, err := c.FormFile("file")
		if err != nil {
			return apperrors.Invalid("No file was received")
		}
		contentType := strings.ToLower(strings.TrimSpace(strings.Split(file.Header.Get("Content-Type"), ";")[0]))
		if _, ok := imageTypes[contentType]; !ok {
			return apperrors.Invalid(file.Filename + ": use a JPEG, PNG or WebP image")
		}
		if file.Size > maxImageBytes {
			return apperrors.Invalid(file.Filename + " is larger than 1 MB")
		}
		opened, err := file.Open()
		if err != nil {
			return err
		}
		defer opened.Close()
		data, err := io.ReadAll(io.LimitReader(opened, maxImageBytes+1))
		if err != nil {
			return err
		}
		if len(data) == 0 {
			return apperrors.Invalid("No file was received")
		}
		if len(data) > maxImageBytes {
			return apperrors.Invalid(file.Filename + " is larger than 1 MB")
		}
		url, err := store.UploadImage(c.UserContext(), file.Filename, contentType, data)
		if err != nil {
			slog.Error("image upload failed", "error", err)
			return &apperrors.Error{Status: 502, Code: "upload_failed", Message: "Image could not be uploaded to storage"}
		}
		return c.JSON(fiber.Map{"url": url})
	}
}
