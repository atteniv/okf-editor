import type { DocMeta } from "./bundle";

/**
 * The bundle knowledge graph, derived from the index (docs/DESIGN.md §4 —
 * this is what the backlinks map has been maintained for). Rendered by the
 * bundle overview; later also the basis for an exported standalone
 * visualizer HTML (the ecosystem's static-visualizer idea).
 */

export interface GraphNode {
  path: string;
  title: string;
  type: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface BundleGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function deriveGraph(docs: Map<string, DocMeta>): BundleGraph {
  const nodes: GraphNode[] = [...docs.values()].map((doc) => ({
    path: doc.path,
    title: doc.title,
    type: doc.type,
  }));

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const doc of docs.values()) {
    for (const link of doc.links) {
      if (!docs.has(link.target) || link.target === doc.path) continue;
      const key = `${doc.path}→${link.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: doc.path, target: link.target });
    }
  }
  return { nodes, edges };
}
