CREATE INDEX IF NOT EXISTS case_document_events_recent ON case_document_request_events(request_id,id DESC);
CREATE INDEX IF NOT EXISTS case_document_deliveries_recent ON case_document_deliveries(request_id,created_at DESC,id DESC);
