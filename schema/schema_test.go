package schema

import (
	"encoding/json"
	"errors"
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

func TestInvalidMetadataFields(t *testing.T) {
	for s, want := range map[string]FieldError{
		`{"image_url":"https://x"}`:  {"image_url", "not in schema"},
		`{"category":"furniture"}`:   {"category", "got string, want null or array"},
		`{"category":[1]}`:           {"category", "item 0: got number, want string"},
		`{"image_urls":[null]}`:      {"image_urls", "item 0: got null, want string"},
		`{"manufacturer":3}`:         {"manufacturer", "got number, want null or string"},
		`{"temperature_stage":"20"}`: {"temperature_stage", "got string, want null or number"},
	} {
		var e *Error
		if err := ValidateMetadata(decode(t, s)); !errors.As(err, &e) || len(e.Fields) != 1 || e.Fields[0] != want {
			t.Errorf("%s: got %v, want %+v", s, err, want)
		}
	}
}

func TestErrorListsEveryField(t *testing.T) {
	err := ValidateMetadata(decode(t, `{"notes":1,"a":1,"b":2,"category":"x"}`))
	want := "invalid metadata: a: not in schema; b: not in schema; category: got string, want null or array; notes: got number, want null or string"
	if err == nil || err.Error() != want {
		t.Fatalf("got %v", err)
	}
}
