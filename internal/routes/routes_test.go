package routes

import (
	"context"
	"encoding/json"
	"fmt"
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
	}{{"GET", "/api/missing", "", 404}, {"GET", "/api", "", 404}, {"GET", "/API/unknown", "", 404}, {"GET", "/", "", 404}, {"GET", "/inventory", "", 404}, {"GET", "/healthz", "", 200}, {"GET", "/readyz", "", 200}, {"GET", "/api/v1/parts?limit=0", "", 400}, {"GET", "/api/v1/parts?offset=-1", "", 400}, {"POST", "/api/v1/parts", `{"sku":"A","name":"A","metadata":null}`, 400}, {"POST", "/api/v1/parts", `{"sku":"A","name":"A","id":"x"}`, 400}, {"GET", "/api/v1/inventory/bad", "", 400}, {"POST", "/api/v1/metadata/validate", `{"category":["a"],"image_urls":null}`, 200}, {"POST", "/api/v1/metadata/validate", `{"image_url":"x"}`, 400}, {"POST", "/api/v1/metadata/validate", `[]`, 400}} {
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

func TestMetadataEndpoints(t *testing.T) {
	app := NewApp(nil, nil)
	res, e := app.Test(httptest.NewRequest("GET", "/api/v1/metadata/schema", nil))
	if e != nil {
		t.Fatal(e)
	}
	var schema struct {
		Properties map[string]any `json:"properties"`
	}
	if e = json.NewDecoder(res.Body).Decode(&schema); e != nil || res.StatusCode != 200 || schema.Properties["image_urls"] == nil {
		t.Fatalf("schema: %d %v %v", res.StatusCode, e, schema)
	}
	req := httptest.NewRequest("POST", "/api/v1/metadata/validate", strings.NewReader(`{"category":"x","colour":1}`))
	req.Header.Set("Content-Type", "application/json")
	if res, e = app.Test(req); e != nil {
		t.Fatal(e)
	}
	var body struct {
		Error struct {
			Details []struct{ Field, Message string } `json:"details"`
		} `json:"error"`
	}
	if e = json.NewDecoder(res.Body).Decode(&body); e != nil || res.StatusCode != 400 {
		t.Fatalf("validate: %d %v", res.StatusCode, e)
	}
	got := fmt.Sprint(body.Error.Details)
	if got != "[{category got string, want null or array} {colour not in schema}]" {
		t.Fatalf("details: %s", got)
	}
}
