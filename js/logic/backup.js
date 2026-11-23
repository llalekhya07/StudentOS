// js/logic/backup.js - PURE: build and VALIDATE the JSON backup.
// The backup holds structured records only. Attached file blobs are NOT included
// (they live in IndexedDB "files"); file resources keep their metadata but need the file in the same browser.

export const BACKUP_VERSION = 1;

export function buildBackup(state, settings, files = null) {
  return {
    app: 'StudentOS',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    includesFiles: Boolean(files),
    note: files ? 'Full backup: records and attached files.' : 'Structured records only. Attached files are not included.',
    settings: { attendanceThreshold: settings.attendanceThreshold, deadlineSoonDays: settings.deadlineSoonDays },
    data: JSON.parse(JSON.stringify(state)),
    ...(files ? { files } : {}),
  };
}

// [store, field, store it must point to]
const REFERENCES = [
  ['courses', 'semesterId', 'semesters'],
  ['timetable', 'courseId', 'courses'],
  ['occurrences', 'courseId', 'courses'],
  ['assessments', 'courseId', 'courses'],
  ['deadlines', 'courseId', 'courses'],
  ['resources', 'courseId', 'courses'],
  ['results', 'courseId', 'courses'],
];

/** Returns { ok, errors[], counts{} }. Never throws on bad input. */
export function validateBackup(obj, storeNames) {
  const errors = [];
  const counts = {};
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['This is not a StudentOS backup file.'], counts };
  if (obj.app !== 'StudentOS') errors.push('This file was not created by StudentOS.');
  if (typeof obj.version !== 'number') errors.push('The backup has no version number.');
  else if (obj.version > BACKUP_VERSION) errors.push(`The backup is from a newer version (${obj.version}).`);
  if (!obj.data || typeof obj.data !== 'object') {
    errors.push('The backup contains no data.');
    return { ok: false, errors, counts };
  }

  if (obj.files !== undefined) {
    const ok = Array.isArray(obj.files) && obj.files.every((f) => f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.data === 'string');
    if (!ok) errors.push('The attached-files section is damaged.');
    else counts.files = obj.files.length;
  }

  for (const store of storeNames) {
    const records = obj.data[store];
    if (records === undefined) { counts[store] = 0; continue; }
    if (!Array.isArray(records)) { errors.push(`"${store}" must be a list.`); continue; }
    counts[store] = records.length;
    if (records.some((r) => !r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id)) {
      errors.push(`Some "${store}" records have no valid id.`);
    }
  }

  if (errors.length === 0) {
    for (const [store, field, target] of REFERENCES) {
      const ids = new Set((obj.data[target] || []).map((r) => r.id));
      const orphans = (obj.data[store] || []).filter((r) => !ids.has(r[field])).length;
      if (orphans) errors.push(`${orphans} "${store}" record(s) point to a missing ${target.slice(0, -1)}.`);
    }
  }
  return { ok: errors.length === 0, errors, counts };
}
