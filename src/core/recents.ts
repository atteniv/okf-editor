export function removeRecentPath(recents: string[], root: string): string[] {
  return recents.filter((recent) => recent !== root);
}

/** Resolve remote locations without making a non-repository recent unusable. */
export async function loadRecentRemotes(
  recents: string[],
  remoteFor: (root: string) => Promise<string | null>,
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    recents.map(async (root) => {
      try {
        return [root, await remoteFor(root)] as const;
      } catch {
        return [root, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Prefer the associated remote, but never expose credentials from its URL. */
export function formatRecentLocation(
  root: string,
  remote: string | null | undefined,
): string {
  if (remote === null || remote === undefined || remote.trim() === "") {
    return root;
  }
  const value = remote.trim();
  const scpRemote = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scpRemote !== null && !value.includes("://")) {
    return `${scpRemote[1]}/${scpRemote[2]}`.replace(/\.git$/, "");
  }
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
    return path === "" ? url.host : `${url.host}/${path}`;
  } catch {
    return value.replace(/\.git$/, "");
  }
}
