import type { ReactNode } from 'react'

interface CollapsiblePanelProps {
  side: 'left' | 'right'
  eyebrow: string
  title: string
  count?: string | number
  collapsed: boolean
  onToggleCollapse: () => void
  className?: string
  children: ReactNode
}

export function CollapsiblePanel({
  side,
  eyebrow,
  title,
  count,
  collapsed,
  onToggleCollapse,
  className,
  children,
}: CollapsiblePanelProps) {
  const collapseLabel = collapsed ? '›' : side === 'left' ? '‹' : '›'
  const expandLabel = side === 'left' ? '›' : '‹'

  return (
    <aside
      className={[
        'panel',
        side === 'left' ? 'panel--left' : 'panel--right',
        collapsed ? 'panel--collapsed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-operator-ui
    >
      <header className="panel__header">
        <div className="panel__header-text">
          <p className="panel__eyebrow">{eyebrow}</p>
          <h2 className="panel__title">{title}</h2>
        </div>
        <div className="panel__header-actions">
          {count !== undefined && !collapsed && (
            <span className="panel__count mono">{count}</span>
          )}
          <button
            type="button"
            className="panel__collapse-btn"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            title={collapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {collapseLabel}
          </button>
        </div>
      </header>

      {collapsed ? (
        <button
          type="button"
          className="panel__collapsed-tab"
          onClick={onToggleCollapse}
          aria-label={`Expand ${title}`}
        >
          <span className="panel__collapsed-glyph" aria-hidden="true">
            {expandLabel}
          </span>
          <span className="panel__collapsed-label">{title}</span>
          {count !== undefined && (
            <span className="panel__collapsed-count mono">{count}</span>
          )}
        </button>
      ) : (
        <div className="panel__body">{children}</div>
      )}
    </aside>
  )
}
