package schema

import (
	"encoding/json"
	"strings"
	"testing"
)

func decode(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	dec := json.NewDecoder(strings.NewReader(s))
	dec.UseNumber()
	if err := dec.Decode(&m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestValidMetadata(t *testing.T) {
	for _, s := range []string{
		`{}`,
		`{"category":[],"image_urls":[]}`,
		`{"category":["furniture"],"manufacturer":"IKEA","country_of_origin":"SE","notes":null,"temperature_stage":-40.5,"image_urls":["https://x/a.jpg","https://x/b.jpg"]}`,
		`{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":null,"image_urls":null}`,
		`{"temperature_stage":9007199254740993}`,
	} {
		if err := ValidateMetadata(decode(t, s)); err != nil {
			t.Errorf("%s: %v", s, err)
		}
	}
}

func TestInvalidMetadata(t *testing.T) {
	for s, want := range map[string]string{
		`{"image_url":"https://x"}`:  "image_url",
		`{"category":"furniture"}`:   "/category",
		`{"category":[1]}`:           "/category/0",
		`{"image_urls":[null]}`:      "/image_urls/0",
		`{"manufacturer":3}`:         "/manufacturer",
		`{"temperature_stage":"20"}`: "/temperature_stage",
	} {
		err := ValidateMetadata(decode(t, s))
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: got %v, want mention of %q", s, err, want)
		}
	}
}
