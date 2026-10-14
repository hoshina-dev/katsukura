package apperrors

import (
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string      { return e.Message }
func Invalid(message string) error  { return &Error{400, "invalid_request", message} }
func NotFound() error               { return &Error{404, "not_found", "Resource not found"} }
func Conflict(message string) error { return &Error{409, "conflict", message} }
func Translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return NotFound()
	}
	var p *pgconn.PgError
	if errors.As(err, &p) {
		switch p.Code {
		case "55P03", "40P01", "40001":
			return &Error{503, "retryable_conflict", "Concurrent change, please retry"}
		case "23505":
			messages := map[string]string{"parts_sku_key": "SKU already exists", "inventory_items_part_id_serial_number_key": "Serial number already exists for this SKU", "part_components_parent_part_id_slot_key": "Slot already exists on this SKU", "item_components_one_active_parent": "Component item already has an active parent"}
			message := messages[p.ConstraintName]
			if message == "" {
				message = "Resource already exists"
			}
			return &Error{409, "duplicate", message}
		case "23503":
			return &Error{409, "referenced_resource", "Referenced resource does not exist or is still in use"}
		case "23514":
			messages := map[string]string{"papi2_bom_cycle": "BOM would contain a cycle", "papi2_item_cycle": "Inventory would contain an ownership cycle", "papi2_slot_match": "Items must match the exact BOM SKUs", "papi2_quantity_cap": "BOM slot quantity would be exceeded", "papi2_active_archived": "Archived resources cannot be in active use", "papi2_part_archive_in_use": "An active BOM cannot reference an archived SKU", "papi2_sku_in_use": "SKU cannot change after use in inventory or a BOM", "papi2_immutable_history": "Installation history is immutable"}
			message := messages[p.ConstraintName]
			if message == "" {
				message = "Change violates inventory or BOM rules"
			}
			return &Error{409, "constraint_violation", message}
		case "23502", "22P02":
			return Invalid("Invalid field value")
		}
	}
	return err
}
