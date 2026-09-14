/**
 * Service status + incidents, behind GET /api/v2/status and
 * GET /api/v2/incidents/unresolved.
 *
 * Components and incidents are rows (editable at /admin/cnvs/status) rather
 * than constants, for the same reason the pricing is: a status change must not
 * need a deploy — least of all during an outage.
 */
import { db } from '@/lib/licenser/db';

export const COMPONENT_STATUSES = [
  'operational',
  'maintenance',
  'degraded',
  'partial_outage',
  'major_outage',
] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_IMPACTS = ['none', 'minor', 'major', 'critical'] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

/** Severity ranking — higher wins when rolling components up to one headline. */
const SEVERITY: Record<ComponentStatus, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

/** An open incident drags the headline down at least this far. */
const IMPACT_FLOOR: Record<IncidentImpact, ComponentStatus> = {
  none: 'operational',
  minor: 'degraded',
  major: 'partial_outage',
  critical: 'major_outage',
};

export interface ServiceComponent {
  key: string;
  name: string;
  description: string | null;
  status: ComponentStatus;
  position: number;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface IncidentRow {
  id: string;
  title: string;
  body: string | null;
  status: IncidentStatus;
  impact: IncidentImpact;
  components: string[];
  started_at: string;
  resolved_at: string | null;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function readComponents(includeDisabled = false): Promise<ServiceComponent[]> {
  let q = db().from('service_components').select('*').order('position', { ascending: true });
  if (!includeDisabled) q = q.eq('enabled', true);
  const { data } = await q;
  return (data ?? []) as ServiceComponent[];
}

/** Unresolved = not marked resolved AND not stamped with a resolution time. */
export async function readUnresolvedIncidents(): Promise<IncidentRow[]> {
  const { data } = await db()
    .from('incidents')
    .select('*')
    .is('resolved_at', null)
    .neq('status', 'resolved')
    .order('started_at', { ascending: false });
  return (data ?? []) as IncidentRow[];
}

export async function readAllIncidents(limit = 50): Promise<IncidentRow[]> {
  const { data } = await db()
    .from('incidents')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as IncidentRow[];
}

export function rollUpStatus(
  components: Array<Pick<ServiceComponent, 'status'>>,
  incidents: Array<Pick<IncidentRow, 'impact'>>,
): ComponentStatus {
  let worst: ComponentStatus = 'operational';
  const bump = (s: ComponentStatus) => { if (SEVERITY[s] > SEVERITY[worst]) worst = s; };

  for (const c of components) bump(c.status);
  for (const i of incidents) bump(IMPACT_FLOOR[i.impact] ?? 'degraded');
  return worst;
}

/** Public shape for one incident — internal audit columns stay internal. */
export function publicIncident(i: IncidentRow) {
  return {
    id: i.id,
    title: i.title,
    body: i.body,
    status: i.status,
    impact: i.impact,
    components: i.components ?? [],
    started_at: i.started_at,
    updated_at: i.updated_at,
    resolved_at: i.resolved_at,
  };
}
