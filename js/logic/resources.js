// js/logic/resources.js - PURE: file validation and resource search/filter.

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const ALLOWED_EXTENSIONS = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'md', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

/** Returns an error message or null. Checks the extension (not the MIME type, which browsers often leave empty). */
export function validateFile(file) {
  if (!file) return 'Choose a file.';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `.${ext} files are not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
  if (file.size > MAX_FILE_BYTES) return 'This file is larger than 10 MB.';
  return null;
}

export function filterResources(list, { course = '', type = '', q = '' }) {
  const needle = q.trim().toLowerCase();
  return list.filter((r) =>
    (!course || r.courseId === course) &&
    (!type || r.resourceType === type) &&
    (!needle || `${r.title} ${r.topic || ''}`.toLowerCase().includes(needle)));
}
