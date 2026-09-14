'use server';
/**
 * Server actions behind /admin/cnvs/status — the rows served by
 * GET /api/v2/status and GET /api/v2/incidents/unresolved.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import {
  COMPONENT_STATUSES,
  INCIDENT_IMPACTS,
  INCIDENT_STATUSES,
  type ComponentStatus,
  type IncidentImpact,
  type IncidentStatus,
} from '@/lib/cnvs/status';

function str(fd: FormData, name: string): string {
  return String(fd.get(name) ?? '').trim();
}

function back(msg: string, isError = false) {
  revalidatePath('/admin/cnvs/status');
  redirect(`/admin/cnvs/status?${isError ? 'error' : 'ok'}=${encodeURIComponent(msg.slice(0, 400))}`);
}

/** Bulk-save the component statuses — during an outage that is one form submit. */
export async function saveComponents(fd: FormData) {
  const { email } = await requireAdmin();
  const keys = fd.getAll('component_key').map(String);
  const now = new Date().toISOString();

  const rows = keys.map((key) => {
    const status = str(fd, `status_${key}`) as ComponentStatus;
    if (!(COMPONENT_STATUSES as readonly string[]).includes(status)) {
      back(`Unknown status "${status}" for component "${key}"`, true);
    }
    return {
      key,
      name: str(fd, `name_${key}`) || key,
      description: str(fd, `description_${key}`) || null,
      status,
      enabled: str(fd, `enabled_${key}`) === 'on',
      updated_at: now,
      updated_by: email,
    };
  });
  if (rows.length === 0) back('No components to save');

  const { error } = await db().from('service_components').upsert(rows, { onConflict: 'key' });
  if (error) back(`Save failed: ${error.message}`, true);
  back('Component statuses saved — live within 60 s');
}

export async function createIncident(fd: FormData) {
  const { email } = await requireAdmin();
  const title = str(fd, 'title');
  if (!title) back('An incident needs a title', true);

  const status = (str(fd, 'status') || 'investigating') as IncidentStatus;
  const impact = (str(fd, 'impact') || 'minor') as IncidentImpact;
  if (!(INCIDENT_STATUSES as readonly string[]).includes(status)) back(`Unknown status "${status}"`, true);
  if (!(INCIDENT_IMPACTS as readonly string[]).includes(impact)) back(`Unknown impact "${impact}"`, true);

  const components = fd.getAll('components').map(String).filter(Boolean);
  const { error } = await db().from('incidents').insert({
    title,
    body: str(fd, 'body') || null,
    status,
    impact,
    components,
    created_by: email,
    updated_by: email,
  });
  if (error) back(`Could not open incident: ${error.message}`, true);
  back('Incident opened — visible on /api/v2/incidents/unresolved within 60 s');
}

export async function updateIncident(fd: FormData) {
  const { email } = await requireAdmin();
  const id = str(fd, 'id');
  if (!id) back('Missing incident id', true);

  const status = str(fd, 'status') as IncidentStatus;
  if (!(INCIDENT_STATUSES as readonly string[]).includes(status)) back(`Unknown status "${status}"`, true);
  const impact = str(fd, 'impact') as IncidentImpact;
  if (!(INCIDENT_IMPACTS as readonly string[]).includes(impact)) back(`Unknown impact "${impact}"`, true);

  const now = new Date().toISOString();
  // Resolving is what clears the incident from the public endpoint; reopening
  // has to clear resolved_at too or it would stay hidden.
  const resolved = status === 'resolved';
  const { error } = await db().from('incidents').update({
    title: str(fd, 'title'),
    body: str(fd, 'body') || null,
    status,
    impact,
    resolved_at: resolved ? now : null,
    updated_at: now,
    updated_by: email,
  }).eq('id', id);
  if (error) back(`Update failed: ${error.message}`, true);
  back(resolved ? 'Incident resolved' : 'Incident updated');
}
