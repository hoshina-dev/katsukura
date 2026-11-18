package models

import (
	"encoding/json"
	"testing"
)

func TestParseMoney(t *testing.T) {
	for _, tc := range []struct {
		in, want string
	}{
		{"0", "0.00"},
		{"0.5", "0.50"},
		{"12", "12.00"},
		{"12.5", "12.50"},
		{"12.50", "12.50"},
		{"0012.5", "12.50"},
	} {
		got, err := ParseMoney(tc.in)
		if err != nil || string(got) != tc.want {
			t.Fatalf("%q: got %q %v, want %q", tc.in, got, err, tc.want)
		}
	}
	for _, bad := range []string{"", "-1", "1.234", "1.2.3", "abc", "+1", "1e2"} {
		if _, err := ParseMoney(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

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
