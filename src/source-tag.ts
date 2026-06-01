// Helper that appends a `source=<tag>` query parameter to mirror URLs so
// mirror operators can attribute incoming traffic to this action without
// changing any user-facing options.

export function withSource(url: string, tag: string): string {
  if (!tag) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}source=${encodeURIComponent(tag)}`;
}
