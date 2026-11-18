package routes

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoshina-dev/katsukura/internal/handlers"
)

func TestStaticFilesAndAPIStaySeparate(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("backoffice"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("js"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := New(nil, func(context.Context) error { return nil }, Options{StaticDir: dir})
	for _, tc := range []struct {
		path, want string
		status     int
	}{
		{"/", "backoffice", 200},
		{"/units/RF-1/items/abc", "backoffice", 200},
		{"/assets/app.js", "js", 200},
		{"/assets/missing.js", "Not Found", 404},
		{"/healthz", "ok", 200},
		{"/api/missing", "Not Found", 404},
	} {
		res, err := app.Test(httptest.NewRequest("GET", tc.path, nil))
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != tc.status || !strings.Contains(string(body), tc.want) {
			t.Fatalf("%s: %d %s", tc.path, res.StatusCode, body)
		}
	}
}

type memoryImages struct {
	got string
}

func (m *memoryImages) UploadImage(context.Context, string, string, []byte) (string, error) {
	return "https://cdn.example/part-image/" + m.got, nil
}

func TestUploadImage(t *testing.T) {
	store := &memoryImages{got: "ok"}
	app := New(nil, nil, Options{Images: store})
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, err := w.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": []string{`form-data; name="file"; filename="bolt.png"`},
		"Content-Type":        []string{"image/png"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write([]byte("png")); err != nil {
		t.Fatal(err)
	}
	w.Close()
	req := httptest.NewRequest("POST", "/api/v1/uploads", body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || !strings.Contains(string(payload), "https://cdn.example/part-image/ok") {
		t.Fatalf("upload: %d %s", res.StatusCode, payload)
	}

	plain := httptest.NewRequest("POST", "/api/v1/uploads", strings.NewReader("x"))
	plain.Header.Set("Content-Type", "text/plain")
	res, err = app.Test(plain)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 400 {
		t.Fatalf("plain upload: %d", res.StatusCode)
	}

	unconfigured := New(nil, nil, Options{})
	res, err = unconfigured.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 503 {
		t.Fatalf("unconfigured: %d", res.StatusCode)
	}
}

var _ handlers.ImageStore = (*memoryImages)(nil)
