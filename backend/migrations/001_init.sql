CREATE TABLE IF NOT EXISTS flight_snapshots (
  id bigserial PRIMARY KEY,
  ts_unix bigint NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flight_snapshots_ts ON flight_snapshots(ts_unix);