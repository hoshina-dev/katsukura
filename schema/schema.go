// Package schema holds the JSON Schema shared by part and inventory item metadata.
package schema

import (
	"bytes"
	_ "embed"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
)

//go:embed metadata.schema.json
var MetadataJSON []byte

var metadata = compile("metadata.schema.json", MetadataJSON)

func compile(name string, raw []byte) *jsonschema.Schema {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		panic(fmt.Errorf("parse %s: %w", name, err))
	}
	c := jsonschema.NewCompiler()
	if err = c.AddResource(name, doc); err != nil {
		panic(err)
	}
	return c.MustCompile(name)
}

// FieldError is one problem with one top-level metadata key.
type FieldError struct {
	Field   string
	Message string
}

// Error lists every metadata problem, sorted by field.
type Error struct{ Fields []FieldError }

func (e *Error) Error() string {
	parts := make([]string, len(e.Fields))
	for i, f := range e.Fields {
		parts[i] = f.Field + ": " + f.Message
	}
	return "invalid metadata: " + strings.Join(parts, "; ")
}

// ValidateMetadata checks a decoded metadata object (map[string]any with
// json.Number or float64 numbers) against metadata.schema.json. Schema
// violations are returned as *Error.
func ValidateMetadata(m map[string]any) error {
	err := metadata.Validate(m)
	var ve *jsonschema.ValidationError
	if !errors.As(err, &ve) {
		return err
	}
	var fields []FieldError
	for _, u := range ve.BasicOutput().Errors {
		if u.Error == nil {
			continue
		}
		if extra, ok := u.Error.Kind.(*kind.AdditionalProperties); ok {
			for _, key := range extra.Properties {
				fields = append(fields, FieldError{key, "not in schema"})
			}
			continue
		}
		if missing, ok := u.Error.Kind.(*kind.Required); ok {
			for _, key := range missing.Missing {
				fields = append(fields, FieldError{key, "required"})
			}
			continue
		}
		// "/category/0" -> field "category", message "item 0: ..."
		path := strings.Split(strings.TrimPrefix(u.InstanceLocation, "/"), "/")
		message := u.Error.String()
		if len(path) > 1 {
			message = "item " + strings.Join(path[1:], "/") + ": " + message
		}
		fields = append(fields, FieldError{path[0], message})
	}
	sort.Slice(fields, func(i, j int) bool { return fields[i].Field < fields[j].Field })
	return &Error{fields}
}
