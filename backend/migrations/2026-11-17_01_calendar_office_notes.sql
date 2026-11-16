-- Office-only notes are separate from description, which is shared externally.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS office_notes text;
COMMENT ON COLUMN calendar_events.office_notes IS 'Internal staff notes. Never include in invitations, reminders, feeds or external calendar sync.';
