-- Update CASE_UPDATE email template to include new available variables:
-- case_number, case_stage, manager_name
UPDATE email_templates
SET available_vars = '["recipient_name","case_title","case_number","case_stage","manager_name","action_url"]'
WHERE template_key = 'CASE_UPDATE';
