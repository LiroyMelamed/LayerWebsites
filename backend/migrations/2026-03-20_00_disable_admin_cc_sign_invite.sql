-- Disable admin CC for signing invite notifications so platform admin
-- does not receive signing messages meant for signers.
BEGIN;

UPDATE notification_channel_config
   SET admin_cc = FALSE
 WHERE notification_type = 'SIGN_INVITE';

COMMIT;
