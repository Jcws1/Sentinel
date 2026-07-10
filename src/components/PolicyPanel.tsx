import { useAppDispatch, useAppSelector } from '../store'
import { toggleOntologyCollapsed } from '../store/uiSlice'
import { CollapsiblePanel } from './CollapsiblePanel'

const ZONE_KIND_LABEL: Record<string, string> = {
  'weapon-free': 'Weapon-Free',
  'hold-fire': 'Hold-Fire',
  'no-go': 'No-Go',
}

export function PolicyPanel() {
  const zones = useAppSelector((s) => s.policy.zones)
  const rules = useAppSelector((s) => s.policy.rules)
  const summary = useAppSelector((s) => s.session.policySummary)
  const ontologyCollapsed = useAppSelector((s) => s.ui.ontologyCollapsed)
  const dispatch = useAppDispatch()

  return (
    <CollapsiblePanel
      side="right"
      eyebrow="Constraints"
      title="ROE"
      count={zones.length}
      collapsed={ontologyCollapsed}
      onToggleCollapse={() => dispatch(toggleOntologyCollapsed())}
      className="panel--policy"
    >
      {zones.length > 0 && (
        <section className="policy-zones">
          <h3 className="ops-section__title">Engagement zones</h3>
          <ul className="policy-zone-list">
            {zones.map((zone) => (
              <li key={zone.id} className="policy-zone-list__item">
                <span
                  className={`policy-zone-list__swatch policy-zone-list__swatch--${zone.kind}`}
                  aria-hidden="true"
                />
                <div>
                  <span className="policy-zone-list__name">{zone.name}</span>
                  <span className="policy-zone-list__kind mono">
                    {ZONE_KIND_LABEL[zone.kind] ?? zone.kind}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="policy-rules">
        <h3 className="ops-section__title">Policy rules</h3>
        <ul className="policy-rule-list">
          {rules.map((rule) => (
            <li key={rule.id} className="policy-rule-list__item mono">
              <span className="policy-rule-list__action">{rule.action}</span>
              <span>{rule.expression}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="panel__footer">
        <p className="panel__eyebrow">Summary</p>
        <dl className="prop-list">
          {(summary.length ? summary : ['No policy loaded']).map((line) => {
            const [label, ...rest] = line.split(':')
            return (
              <div className="prop-list__row" key={line}>
                <dt>{label}</dt>
                <dd>{rest.join(':').trim() || line}</dd>
              </div>
            )
          })}
        </dl>
        <p className="policy-readonly mono">Read-only — authority approval required</p>
      </footer>
    </CollapsiblePanel>
  )
}
