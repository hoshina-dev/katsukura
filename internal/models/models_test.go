package models

import (
	"encoding/json"
	"testing"
)

func TestJSONMapPreservesLargeInteger(t *testing.T) {
	var m JSONMap
	raw := `{"large":9007199254740993,"nested":{"number":12345678901234567890}}`
	if e := m.Scan([]byte(raw)); e != nil {
		t.Fatal(e)
	}
	if m["large"] != json.Number("9007199254740993") {
		t.Fatalf("number rounded: %v", m["large"])
	}
	v, e := m.Value()
	if e != nil {
		t.Fatal(e)
	}
	if v != raw {
		t.Fatalf("roundtrip changed: %s", v)
	}
}
func TestJSONMapRejectsNonObject(t *testing.T) {
	for _, v := range []string{"null", "[]", "1"} {
		var m JSONMap
		if e := m.Scan(v); e == nil {
			t.Fatalf("accepted %s", v)
		}
	}
}
