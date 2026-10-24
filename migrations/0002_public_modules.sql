-- The IDs of the modules in Foundry's public package index. Reports only keep
-- modules on this list, so private or unreleased modules' names are never
-- stored.
CREATE TABLE public_modules (
  id TEXT PRIMARY KEY
) WITHOUT ROWID;

-- When the list was last refreshed (one row).
CREATE TABLE public_modules_refreshed (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  refreshed_at TEXT NOT NULL,
  module_count INTEGER NOT NULL
);
