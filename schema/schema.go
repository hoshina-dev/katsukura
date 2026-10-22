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

// ValidateMetadata checks a decoded metadata object (map[string]any with
// json.Number or float64 numbers) against metadata.schema.json.
func ValidateMetadata(m map[string]any) error {
	err := metadata.Validate(m)
	var ve *jsonschema.ValidationError
	if !errors.As(err, &ve) {
		return err
	}
	var msgs []string
	for _, u := range ve.BasicOutput().Errors {
		if u.Error == nil {
			continue
		}
		msgs = append(msgs, strings.TrimPrefix(u.InstanceLocation+": ", ": ")+u.Error.String())
	}
	sort.Strings(msgs)
	return errors.New("invalid metadata: " + strings.Join(msgs, "; "))
}
