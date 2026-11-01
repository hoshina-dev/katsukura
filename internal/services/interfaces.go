package services

import (
	"context"
	"github.com/google/uuid"
	"github.com/hoshina-dev/katsukura/internal/models"
)

type Store interface {
	WithLock(context.Context, func(Store) error) error
	Read(context.Context, func(Store) error) error
	GetPart(context.Context, uuid.UUID) (*models.Part, error)
	GetItem(context.Context, uuid.UUID) (*models.InventoryItem, error)
	GetComponent(context.Context, uuid.UUID) (*models.PartComponent, error)
	GetInstallation(context.Context, uuid.UUID) (*models.ItemComponent, error)
	Create(context.Context, any) error
	AvailableItems(ctx context.Context, partID uuid.UUID, limit int) ([]uuid.UUID, error)
	HasItems(ctx context.Context, partID uuid.UUID) (bool, error)
	Update(context.Context, any, uuid.UUID, map[string]any) error
	Archive(context.Context, any, uuid.UUID) error
	ArchivePartItems(context.Context, uuid.UUID) error
	DeleteComponent(context.Context, uuid.UUID) error
	Remove(context.Context, uuid.UUID, uuid.UUID) error
	Components(context.Context, uuid.UUID) ([]models.PartComponent, error)
	ParentComponents(context.Context, uuid.UUID) ([]models.PartComponent, error)
	Installations(context.Context, uuid.UUID, bool) ([]models.ItemComponent, error)
	Parts(context.Context, models.Filter) (models.Page[models.Part], error)
	Stock(ctx context.Context, partIDs []uuid.UUID) (map[uuid.UUID]models.Stock, error)
	Items(context.Context, models.Filter) (models.Page[models.InventoryItem], error)
	Tree(context.Context, uuid.UUID, int) (*models.TreeNode, error)
	Summary(context.Context) (models.Summary, error)
}
