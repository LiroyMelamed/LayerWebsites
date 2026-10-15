-- Remove [[case_number]] placeholder from email template HTML bodies
-- and remove "case_number" from available_vars JSON arrays.
-- The DB case number is an internal ID not shown to lawyers or clients.

-- Strip all occurrences of [[case_number]] from html_body
UPDATE email_templates
SET html_body = REPLACE(html_body, '[[case_number]]', '')
WHERE html_body LIKE '%[[case_number]]%';

-- Strip [[case_number]] from subject_template
UPDATE email_templates
SET subject_template = REPLACE(subject_template, '[[case_number]]', '')
WHERE subject_template LIKE '%[[case_number]]%';

-- Remove "case_number" from the available_vars JSON array
UPDATE email_templates
SET available_vars = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(available_vars) AS elem
    WHERE elem <> 'case_number'
)
WHERE available_vars @> '"case_number"'::jsonb;
