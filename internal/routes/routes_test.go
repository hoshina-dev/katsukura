package routes

import (
	"context"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPValidationAndNotFound(t *testing.T) {
	app := NewApp(nil, func(context.Context) error { return nil })
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{{"GET", "/api/missing", "", 404}, {"GET", "/api", "", 404}, {"GET", "/API/unknown", "", 404}, {"GET", "/", "", 404}, {"GET", "/inventory", "", 404}, {"GET", "/healthz", "", 200}, {"GET", "/readyz", "", 200}, {"GET", "/api/v1/parts?limit=0", "", 400}, {"GET", "/api/v1/parts?offset=-1", "", 400}, {"POST", "/api/v1/parts", `{"sku":"A","name":"A","metadata":null}`, 400}, {"POST", "/api/v1/parts", `{"sku":"A","name":"A","id":"x"}`, 400}, {"GET", "/api/v1/inventory/bad", "", 400}} {
		t.Run(tc.path+tc.body, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			res, e := app.Test(req)
			if e != nil {
				t.Fatal(e)
			}
			defer res.Body.Close()
			if res.StatusCode != tc.status {
				b, _ := io.ReadAll(res.Body)
				t.Fatalf("status %d want %d: %s", res.StatusCode, tc.status, b)
			}
			if tc.status >= 400 && !strings.Contains(res.Header.Get("Content-Type"), "application/json") {
				t.Fatal("error not JSON")
			}
		})
	}
}

func TestRejectsCrossSiteJSONBody(t *testing.T) {
	app := NewApp(nil, nil)
	for _, method := range []string{"POST", "PATCH"} {
		path := "/api/v1/parts"
		if method == "PATCH" {
			path += "/00000000-0000-0000-0000-000000000001"
		}
		req := httptest.NewRequest(method, path, strings.NewReader(`{"name":"A","sku":"A"}`))
		req.Header.Set("Content-Type", "text/plain")
		res, e := app.Test(req)
		if e != nil {
			t.Fatal(e)
		}
		res.Body.Close()
		if res.StatusCode != 415 {
			t.Fatalf("%s accepted incompatible Content-Type: %d", method, res.StatusCode)
		}
	}
}
