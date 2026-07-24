'use client';
/**
 * Lead assignment / routing rules. Renders the visual Assignment Rulebook — a
 * priority-ordered stack of "when a lead looks like this → give it to this
 * person/team" cards. It writes the same crm_lead_assignment_rules shape that
 * assignOwner() reads ({ name, priority, criteria{}, assign_to_user_id |
 * round_robin_pool[], pipeline_id }); the vertical card order IS the priority
 * order (first match wins).
 */
import AssignmentRulebook from '../../../../../components/crm/assignment/AssignmentRulebook';

export default function AssignmentRulesPage() {
  return <AssignmentRulebook />;
}
