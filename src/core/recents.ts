export function removeRecentPath(recents: string[], root: string): string[] {
  return recents.filter((recent) => recent !== root);
}
