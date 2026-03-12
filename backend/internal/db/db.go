package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func Connect(url string) (*Store, error) {
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) InsertSnapshot(ctx context.Context, t int64, payload []byte) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO flight_snapshots(ts_unix, payload)
		VALUES ($1, $2)
	`, t, payload)
	return err
}
