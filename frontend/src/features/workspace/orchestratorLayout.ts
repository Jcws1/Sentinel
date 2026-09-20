import type { IJsonModel } from 'flexlayout-react';

export type OrchestratorTab = 'units' | 'conductor';

/** Normalize an imported layout without mutating its source or adjacent pane IDs.
 * Prefer the selected authoring pane in the active tabset, then any selected
 * authoring pane, then document traversal order. Deduplicate only authoring panes.
 */
export function normalizeOrchestratorLayout(input: IJsonModel): {
  layout: IJsonModel;
  tab: OrchestratorTab;
} {
  const layout = structuredClone(input);
  type Node = {
    type?: string;
    id?: string;
    name?: string;
    component?: string;
    selected?: number;
    active?: boolean;
    children?: Node[];
    config?: { orchestratorTab?: OrchestratorTab };
  };
  const candidates: { node: Node; rank: number }[] = [];
  const roots = [
    layout.layout,
    ...(layout.borders ?? []),
    ...Object.values(layout.subLayouts ?? {}).map((l) => l.layout),
  ] as Node[];
  function scan(node: Node) {
    node.children?.forEach((child, index) => {
      if (['units', 'conductor', 'orchestrator'].includes(child.id ?? ''))
        candidates.push({
          node: child,
          rank: node.selected === index ? (node.active ? 2 : 1) : 0,
        });
      scan(child);
    });
  }
  roots.forEach(scan);
  const winner = [...candidates].sort((a, b) => b.rank - a.rank)[0]?.node;
  const tab =
    winner?.id === 'conductor' ||
    winner?.config?.orchestratorTab === 'conductor'
      ? 'conductor'
      : 'units';
  const emptied = new Set<Node>();
  function rewrite(node: Node) {
    if (!node.children) return;
    const before = node.children.length;
    const selectedIndex = node.selected;
    const selected = node.children[node.selected ?? 0];
    node.children = node.children.filter(
      (child) => !candidates.some((c) => c.node === child) || child === winner,
    );
    if (
      before !== node.children.length &&
      selectedIndex !== undefined &&
      selectedIndex >= 0 &&
      (node.type === 'tabset' || node.type === 'border')
    ) {
      const retainedIndex = node.children.indexOf(selected);
      node.selected =
        retainedIndex >= 0
          ? retainedIndex
          : Math.max(0, Math.min(node.children.length - 1, selectedIndex));
    }
    node.children.forEach(rewrite);
    // Empty tabsets left solely by deduplication must not consume workspace space.
    node.children = node.children.filter((child) => !emptied.has(child));
    if (
      before > 0 &&
      !node.children.length &&
      (node.type === 'tabset' || node.type === 'row')
    )
      emptied.add(node);
  }
  roots.forEach(rewrite);
  if (winner) {
    winner.id = 'orchestrator';
    winner.name = 'Orchestrator';
    winner.component = 'orchestrator';
    winner.config = { ...winner.config, orchestratorTab: tab };
  }
  return { layout, tab };
}
