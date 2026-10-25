-- One row per package, install and UTC day. A later report the same day
-- replaces the earlier one, along with its settings and modules.
CREATE TABLE reports (
  package_id TEXT NOT NULL,
  install_id TEXT NOT NULL,
  day TEXT NOT NULL,
  package_version TEXT NOT NULL,
  foundry_version TEXT NOT NULL,
  language TEXT NOT NULL,
  user_count INTEGER NOT NULL,
  country TEXT,
  shares_modules INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (package_id, install_id, day)
) WITHOUT ROWID;

CREATE INDEX reports_by_day ON reports (package_id, day);

CREATE TABLE report_settings (
  package_id TEXT NOT NULL,
  install_id TEXT NOT NULL,
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  -- stored as text; `value_type` says what it was
  value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean')),
  PRIMARY KEY (package_id, install_id, day, key)
) WITHOUT ROWID;

CREATE TABLE report_modules (
  package_id TEXT NOT NULL,
  install_id TEXT NOT NULL,
  day TEXT NOT NULL,
  module_id TEXT NOT NULL,
  module_version TEXT NOT NULL,
  PRIMARY KEY (package_id, install_id, day, module_id)
) WITHOUT ROWID;

-- For each package, week (the Monday it starts, UTC) and dimension, how many
-- installs reported each value. An install counts once per week, with what it
-- last reported that week. Kept after the raw rows are deleted.
--
-- Dimensions: "installs" (value ""), "packageVersion", "foundryVersion",
-- "language", "country", "userCount", "setting:<key>", and
-- "module" (value: module ID) and "moduleVersion:<module ID>".
CREATE TABLE weekly_counts (
  package_id TEXT NOT NULL,
  week TEXT NOT NULL,
  dimension TEXT NOT NULL,
  value TEXT NOT NULL,
  installs INTEGER NOT NULL,
  PRIMARY KEY (package_id, week, dimension, value)
) WITHOUT ROWID;
