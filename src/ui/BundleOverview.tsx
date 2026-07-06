import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useMemo, useState } from "react";
import type { DocMeta } from "../core/bundle";
import { deriveGraph } from "../core/graph";

const WIDTH = 900;
const HEIGHT = 600;
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#dc2626",
];
const UNTYPED_COLOR = "#9ca3af";

interface LayoutNode extends SimulationNodeDatum {
  path: string;
  title: string;
  type: string | null;
}

interface BundleOverviewProps {
  docs: Map<string, DocMeta>;
  onOpen: (path: string) => void;
}

/**
 * The bundle's knowledge graph, shown when no document is open — every doc
 * a node, every resolved link an edge. Layout runs synchronously (static
 * force ticks), so there's no animation loop to manage.
 */
export function BundleOverview({ docs, onOpen }: BundleOverviewProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const { nodes, links, typeColors } = useMemo(() => {
    const graph = deriveGraph(docs);
    const nodes: LayoutNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: SimulationLinkDatum<LayoutNode>[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));
    forceSimulation(nodes)
      .force(
        "link",
        forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links)
          .id((d) => d.path)
          .distance(110),
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide(34))
      .stop()
      .tick(300);

    const types = [...new Set(graph.nodes.map((n) => n.type ?? ""))].sort();
    const typeColors = new Map(
      types.map((type, i) => [type, type === "" ? UNTYPED_COLOR : PALETTE[i % PALETTE.length]]),
    );
    return { nodes, links, typeColors };
  }, [docs]);

  const nodeOf = (end: LayoutNode | string | number): LayoutNode =>
    typeof end === "object" ? end : nodes.find((n) => n.path === end)!;

  const touchesHovered = (link: SimulationLinkDatum<LayoutNode>) =>
    hovered !== null &&
    (nodeOf(link.source).path === hovered || nodeOf(link.target).path === hovered);

  return (
    <div className="overview">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Bundle graph">
        {links.map((link, i) => {
          const s = nodeOf(link.source);
          const t = nodeOf(link.target);
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              className={touchesHovered(link) ? "edge highlighted" : "edge"}
            />
          );
        })}
        {nodes.map((node) => (
          <g
            key={node.path}
            transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
            className={`node ${hovered === node.path ? "hovered" : ""}`}
            onMouseEnter={() => setHovered(node.path)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onOpen(node.path)}
          >
            <circle r={11} fill={typeColors.get(node.type ?? "") ?? UNTYPED_COLOR} />
            <text y={26}>{node.title}</text>
            <title>{node.path}</title>
          </g>
        ))}
      </svg>

      <footer className="overview-footer">
        <ul className="overview-legend">
          {[...typeColors.entries()].map(([type, color]) => (
            <li key={type || "(untyped)"}>
              <span className="legend-dot" style={{ background: color }} />
              {type || "(no type)"}
            </li>
          ))}
        </ul>
        <p className="hint">
          Click a node to open it · <kbd>⌘P</kbd> quick-open · <kbd>⌘N</kbd> new
          document
        </p>
      </footer>
    </div>
  );
}
