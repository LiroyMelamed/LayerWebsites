# Recovery procedure

Use the exact tenant entry in release-record.json. Never restart all PM2 processes and never copy another office's configuration.

1. Preserve a fresh private backup of the current tenant data before recovery. Do not replace a live database with an earlier snapshot merely to roll back the UI.
2. Frontend VPS tenants: restore the recorded complete directory backup atomically, preserving the current directory for investigation. MelamedLaw FTP: restore the saved original index and any overwritten mutable public files from its local frontend backup; immutable old bundles were retained on the server. Keep TLS certificate verification enabled.
3. Backend: after checking current HEAD and local changes, restore only that tenant's recorded previousSource and preserved private configurations, and restore dependencies from the matching lockfile. Restart only the named tenant process and verify /health and authenticated access.
4. Schema additions are additive. Retain them and the newly recorded activity by default. Do not drop activity, integration or signup tables during a code rollback. If a trigger itself is the cause, review disabling only the named new trigger rather than deleting data.
5. Full database restore is a separate, destructive recovery decision: assess new writes, obtain the owner's authorization and use the verified private dump for the correct tenant. Do not run it automatically.
6. Verify the prior API URL, branding, other PM2 processes and outbound settings. Record the final deployed source; do not move or overwrite existing release tags.
