import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminActor = {
  userId: string;
  role: string;
};

/**
 * Append one row to the audit trail.
 *
 * Auditing is best-effort by design: a failure here must never roll back the
 * business write that triggered it, so nothing is thrown.
 */
export async function recordAudit(
  actor: AdminActor,
  action: string,
  tableName: string,
  recordId: string,
  oldValues: unknown,
  newValues: unknown,
) {
  const result = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.role,
    action,
    table_name: tableName,
    record_id: recordId,
    old_values: oldValues,
    new_values: newValues,
  });

  // Older production databases use the original audit-log shape. Preserve
  // an audit trail across that migration boundary until the normalized table
  // is deployed everywhere.
  if (result.error) {
    await supabaseAdmin.from("audit_logs").insert({
      admin_email: actor.userId,
      action,
      table_name: tableName,
      record_id: recordId,
      details: { oldValues, newValues, actorRole: actor.role },
    });
  }
}
