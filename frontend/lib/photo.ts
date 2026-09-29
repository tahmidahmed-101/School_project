/**
 * Asset URL helper served from the site root (public/).
 */
export function photo(path: string): string {
  const clean = path.replace(/^\/+/, "");
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  return `/${clean}`;
}
