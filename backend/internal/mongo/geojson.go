package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Stores GeoJSON Feature documents as-is (map form).
// We recommend each feature has a stable ID in properties (or top-level "id").
func (s *Store) UpsertFeature(ctx context.Context, collection string, feature any, id string) error {
	coll := s.DB.Collection(collection)

	filter := bson.M{"feature_id": id}
	update := bson.M{
		"$set": bson.M{
			"feature_id": id,
			"feature":    feature,
		},
	}

	_, err := coll.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))
	return err
}
