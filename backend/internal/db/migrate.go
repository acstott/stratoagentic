package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (s *Store) Migrate(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(files)

	ctx := context.Background()
	_, _ = s.pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (filename text primary key)`)

	for _, f := range files {
		applied, err := s.isApplied(ctx, filepath.Base(f))
		if err != nil {
			return err
		}
		if applied {
			continue
		}

		b, err := os.ReadFile(f)
		if err != nil {
			return err
		}

		if _, err := s.pool.Exec(ctx, string(b)); err != nil {
			return fmt.Errorf("apply %s: %w", f, err)
		}
		if _, err := s.pool.Exec(ctx, `INSERT INTO schema_migrations(filename) VALUES ($1)`, filepath.Base(f)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) isApplied(ctx context.Context, filename string) (bool, error) {
	var x string
	err := s.pool.QueryRow(ctx, `SELECT filename FROM schema_migrations WHERE filename=$1`, filename).Scan(&x)
	if err != nil {
		return false, nil
	}
	return x == filename, nil
}
