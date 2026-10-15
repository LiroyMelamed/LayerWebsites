BEGIN;
ALTER TABLE court_case_links ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
-- Preserve all existing aliases, and show one stable primary reference in the case form.
WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY case_id ORDER BY created_at, id) AS position
    FROM court_case_links
    WHERE case_id NOT IN (SELECT case_id FROM court_case_links WHERE is_primary)
)
UPDATE court_case_links SET is_primary=true FROM ranked
WHERE court_case_links.id=ranked.id AND ranked.position=1;
CREATE UNIQUE INDEX IF NOT EXISTS court_case_links_primary_case ON court_case_links(case_id) WHERE is_primary;
COMMIT;
