# ROE engine market research and UX recommendations

Date: 27 July 2026

## Executive conclusion

Publicly available BMS and C2 material does not reveal a standard, mature "ROE settings" screen. It does reveal a consistent operating model:

1. Decisions happen in the same map and mission environment as the operational picture.
2. Information is role-tailored but synchronized across echelons.
3. Changes are sent as structured tasks, plans, overlays, or target nominations, with status returned to the commander.
4. The system must work with limited bandwidth, intermittent connectivity, and locally cached mission data.
5. The human commander remains the decision authority; software should expose restrictions, assumptions, approval requirements, and traceable status.

Military doctrine adds the missing ROE-specific workflow: commanders own ROE; operations and legal staff collaborate on their development; rules must be clear, mission-specific, current, and continuously assessed; changes require request, authorization, dissemination, and control.

Enterprise rule-management products add the strongest model for a settings experience: decision tables, natural-language previews, role-based authoring, overlap/gap validation, scenario simulation, governed releases, deployment permissions, audit, and rollback.

The best direction for Sentinel is therefore not a larger rule form. It is a **versioned ROE package workspace** with:

- hard legal/authority gates before option scoring;
- a commander-oriented comparison view for viable packages;
- a governed draft-review-approve-publish lifecycle;
- entity-level rollout, acknowledgement, and freshness status;
- a compact execution view that explains the effective rule and required action at the point of decision.

## What the supplied context tells us

### Stakeholder feedback

The feedback image contains three explicit product requirements:

- Show a settings page where a commander can change rules for a scenario and update every affected entity.
- Provide a simple "power bar" or comparison UI.
- Help the commander choose quickly among multiple possible solutions.

The referenced pentagon/radar treatment compared five parameters using two colors. That is a useful visual summary, but it should not be the primary decision control. A side-by-side matrix with aligned bars makes exact differences easier to compare. A radar chart may remain as an optional "shape of the package" thumbnail.

### Supplied BMS guide

Systematic's 2023 guide, *10 things to consider when choosing your dismounted Battle Management System*, recommends:

- standard software and user-friendly interfaces;
- a BMS acting as the integration hub;
- operation over constrained, intermittent, and error-prone networks without a single point of failure;
- easy pre-deployment configuration and field reconfiguration;
- simple management of configuration and updates across hundreds of devices;
- continuity between mounted and dismounted operation;
- in-app, scenario-oriented training;
- central management and monitoring while allowing appropriate user self-service;
- realistic testing with end users before purchase or deployment.

For the ROE engine, the most important implication is that a policy change is not complete when the commander presses Publish. It is complete only when the signed package is distributed, acknowledged, active, and observable across the intended fleet, including devices that were offline.

## Current market signals

### Systematic SitaWare

SitaWare Edge emphasizes a common interface and aligned symbology across echelons, structured quick forms that reduce typing and error, map overlays, and efficient exchange over limited bandwidth. Its current tactical workflow lets a user nominate a target from the map or an existing symbol, including location, target type, required effect, and timing. The nomination appears at headquarters without re-entry. Systematic states that later releases will return engagement and processing status to tactical users.

UX implications:

- ROE should be attached to map objects, tasks, and target nominations rather than living only in a separate policy module.
- A structured request should carry the minimum decision fields and preserve provenance.
- The field user needs the status of the request and the effective authorization returned to the same object.
- A common rule vocabulary and visual state should be preserved across headquarters, vehicle, and handheld layouts.

Sources:

- [SitaWare Edge product page](https://systematic.com/us/industries/defense/products/sitaware-suite/sitaware-edge/)
- [Closing the targeting loop with SitaWare, 21 July 2026](https://systematic.com/int/industries/defence/news-knowledge/blog/closing-the-targeting-loop/)
- [Distributing the workload](https://systematic.com/us/industries/defense/news-knowledge/news/distributing-the-workload/)
- [SitaWare low-code and configuration approach](https://systematic.com/us/industries/defense/news-knowledge/blog/supporting-low-code-and-no-code/)

### Saab 9Land BMS

Saab publicly describes a coherent, scalable system with decision support, planning and mission management, order management, alarms and alerts, configurable mission baseline packages, and multiple spatial, time, and association views. It uses a decentralized replication model so loss of a system does not mean loss of functionality.

UX implications:

- Treat an ROE configuration as a mission baseline package.
- Present the same policy through complementary map, timeline, entity, and rule views.
- Make warnings event-driven and show which rule, object, or condition caused them.
- Design distribution and local evaluation so the absence of a central node does not erase effective policy.

Source: [Saab 9Land BMS](https://www.saab.com/products/9land-bms)

### Elbit TORCH-X Maritime

Elbit states that its AI tools recommend tasks to commanders based on available data and in accordance with ROE.

UX implication:

- A recommendation should be presented as a traceable proposal under the active ROE, never as an unexplained authorization.
- The interface should separate "system recommendation," "ROE eligibility," and "human authorization."

Source: [TORCH-X Maritime](https://www.elbitsystems.com/networked-warfare/maritime/coastal-maritime-protection/torch-x-maritime)

### TAK and US Army common environments

TAK supports creation, sharing, and access to tactical data during planning and operations, with synchronization when connectivity is available. TAK Server brokers and stores mission data, while plugins add workflows such as data synchronization and execution checklists.

The Army's Command Post Computing Environment emphasizes a common map, data strategy, applications, and look-and-feel across warfighting functions, replacing stove-piped systems.

UX implications:

- ROE should be a shared service consumed by tasking, targeting, map, and alert workflows.
- Store-and-forward synchronization, visible freshness, and explicit offline behavior are first-class product states.
- Use one interaction grammar across settings, evaluation, and execution.

Sources:

- [TAK products](https://tak.gov/products)
- [Army Command Post Computing Environment](https://www.army.mil/article/168119/command_post_computing_environment)

## ROE doctrine translated into product requirements

The US Army Operational Law Handbook says commanders are responsible for ROE, with operators and judge advocates collaborating on development and implementation. It recommends direct, plain, mission-specific language; tailoring cards to their audience; showing an "as of" date; anticipating changes; ensuring only the latest serial is used; cataloguing requests and approvals; monitoring training; and maintaining a timely process for changes.

The May 2026 Air Force targeting doctrine says ROE must be simple and clear, incorporate operators, planners, commanders, and legal advisors, and be reviewed early and continuously. It also distinguishes no-strike objects from valid but restricted targets.

Joint fires doctrine distinguishes:

- **No-strike:** protected objects or entities that are not targets.
- **Restricted:** valid targets with explicit engagement restrictions.
- **Fire-support coordination measures:** spatial or procedural measures that permit or restrict fires.

Product requirements:

- Model **source, issuing authority, delegated authority, serial/version, effective time, expiry, scope, classification, and supersession**.
- Keep **no-strike, restricted, approval-required, and indeterminate** states semantically distinct.
- Provide plain-language execution cards derived from, but linked to, the authoritative rule.
- Make request and authorization a trackable workflow, not a generic notification.
- Require explicit acknowledgement for material changes and show which units/entities remain on an old serial.
- Preserve an immutable audit trail of proposals, comments, approvals, publications, acknowledgements, and revocations.
- Support phase-specific rules in one package to reduce confusion during planned transitions.
- Include scenario/vignette testing and refresher prompts as part of readiness.

Sources:

- [US Army Operational Law Handbook, Chapter 5: Rules of Engagement](https://tjaglcs.army.mil/Periodicals/Deskbooks-Handbooks/Operational-Law-Handbook?topic=Chapter+5%3A+RULES+OF+ENGAGEMENT)
- [Air Force Doctrine Publication 3-60, Targeting, 1 May 2026](https://www.doctrine.af.mil/Portals/61/documents/AFDP_3-60/3-60-AFDP-TARGETING.pdf)
- [Joint Publication 3-09, Joint Fire Support](https://www.jcs.mil/portals/36/documents/doctrine/pubs/jp3_09.pdf)

## Enterprise rule-management patterns worth borrowing

IBM Operational Decision Manager provides a useful governance reference:

- business-user rule authoring;
- decision tables for multiple conditions and actions;
- configurable vocabulary and valid-value templates;
- development warnings for overlaps and gaps;
- branches or a defined governance workflow;
- scenario tests and simulations;
- separate non-production and production deployment;
- permission-controlled production release;
- audit and rollback.

Cedar/Amazon Verified Permissions provides useful evaluation semantics:

- policy is separate from application logic;
- principal, action, resource, and context form a consistent request model;
- explicit forbid overrides permit;
- no matching policy results in default deny;
- automated analysis can validate policy behavior.

Recommended adaptation for Sentinel:

- Use a domain vocabulary, not free-form code, for normal authoring.
- Offer a decision-table view for expert staff and a plain-language sentence preview for commanders.
- Validate unreachable rules, missing coverage, overlaps, contradictory outcomes, invalid authority, expired sources, and scope collisions before review.
- Simulate proposed changes against saved scenarios and recent representative events.
- Show exactly which entities, tasks, zones, and outcomes would change.
- Separate Draft, Test, Review, Approved, Scheduled, Active, Superseded, and Recalled states.

Sources:

- [IBM decision management and governance](https://www.ibm.com/docs/en/odm/9.0.0?topic=manager-decision-management-governance)
- [IBM decision tables](https://www.ibm.com/docs/en/odmoc?topic=work-decision-tables)
- [AWS Cedar overview](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-api-access-authorization/cedar.html)

## Recommended information architecture

Add a top-level **ROE Settings** workspace with seven views:

1. **Overview**
   - Active package, serial, issuing authority, effective/expiry times.
   - Deployment status: active, pending, stale, failed, offline.
   - Units/entities covered and exceptions.
   - High-priority conflicts or acknowledgements required.

2. **Scope**
   - Mission phase, geography, unit, entity/asset class, task type, target/object class, control mode, and network state.
   - A map preview for geographic measures.
   - Inheritance from higher authority and non-overridable restrictions.

3. **Rules**
   - Decision table: conditions on the left, effect/action on the right.
   - Effects: Permit, Permit with constraints, Approval required, Prohibit, Indeterminate.
   - Source, precedence, rationale, owner, and revalidation trigger per row.
   - Plain-language preview and source-document link.

4. **Compare**
   - Two to four viable packages side by side.
   - Hard-gate failures first.
   - Commander-approved criteria, weights, aligned bars, values, and difference callouts.
   - Assumptions, uncertainty, and the dominant trade-off for each option.

5. **Test**
   - Saved scenarios and vignettes.
   - Expected versus actual outcome.
   - Coverage, conflicts, changed outcomes, and affected entities.
   - Offline/degraded-link and stale-context tests.

6. **Rollout**
   - Draft -> Review -> Approved -> Scheduled -> Distributing -> Active.
   - Fleet/unit tree with current serial, delivery time, acknowledgement, and last contact.
   - Retry, staged rollout, pause, recall, and rollback controls.

7. **Audit**
   - Immutable event timeline.
   - Diff between any two versions.
   - Who proposed, reviewed, approved, published, acknowledged, or overrode a decision.
   - Exportable decision trace.

## The commander comparison experience

### First, apply hard gates

Do not score an option that is legally prohibited, outside authority, unsupported by required evidence, or operationally infeasible. Show it as **Not viable** with the controlling rule and the next valid action, such as request higher approval or obtain missing information.

### Then compare viable options

Military decision-making doctrine uses criteria approved by the commander and commonly a comparison matrix. A recent Army risk discussion recommends two to five measurable evaluation criteria. Suggested defaults for Sentinel:

1. Mission effect.
2. Risk to friendly force.
3. Civilian/protected-object risk.
4. C2 resilience and reversibility.
5. Time/resource burden.

Legal compliance and delegated authority should remain gates, not tradable weighted criteria.

Source: [US Army, MDMP & Risk, 15 December 2025](https://www.army.mil/article/289381/mdmp_risk)

### Recommended visual

Use one row per criterion:

`Criterion | Package A bar + value | Package B bar + value | Difference | Confidence`

At the top of each package show:

- viability;
- approvals required;
- number of affected entities;
- time to become effective;
- primary advantage;
- primary risk.

Use a colorblind-safe package color for comparison, but reserve semantic colors for states:

- green: within authority;
- amber: constraint or approval;
- red: prohibited;
- grey: unknown/stale/offline.

Do not rely on color alone. Always include icon, label, and text.

Bar variants with difference overlays support a wider range of comparison tasks than bars without explicit differences. A radar chart is acceptable only as a secondary overview because multi-series radar plots make precise comparison difficult.

Source: [Microsoft Research, bar charts with difference overlays](https://www.microsoft.com/en-us/research/publication/whats-difference-evaluating-variants-multi-series-bar-charts-visual-comparison-tasks/)

### Keep command judgment visible

The system may say:

> Recommended for the commander's current priorities because it reduces civilian-risk exposure and remains executable under degraded C2. Requires designated-reviewer approval.

It should not say:

> Best option: 87%.

Always expose:

- who set the criteria and weights;
- data freshness;
- assumptions and uncertainty;
- rules that controlled viability;
- what changed from the baseline package;
- who must authorize the choice.

DoD guidance for consequential human-machine systems calls for understandable interfaces, transparent system-status feedback, and appropriate human judgment.

Sources:

- [DoD AI ethical principles](https://www.defense.gov/Explore/News/Article/Article/2094085/dod-adopts-5-principles-of-artificial-intelligence-ethics)
- [DoD Directive 3000.09, 25 January 2023](https://media.defense.gov/2023/Jan/25/2003149928/-1/-1/0/DOD-DIRECTIVE-3000.09-AUTONOMY-IN-WEAPON-SYSTEMS.PDF)

## Recommended execution UX

At the point where an operator acts on a task, target, or entity, show a compact **Effective ROE card**:

- current outcome in plain language;
- controlling rule and source;
- constraints;
- approval authority and request status;
- policy serial and freshness;
- revalidation triggers;
- one safe next action.

Examples:

- **Within standing authority** - Continue within declared area until 14:35Z.
- **Approval required** - Protected-location buffer applies. Request designated review.
- **Indeterminate** - Civilian context is stale. Refresh before proceeding.
- **Prohibited** - No-strike protection applies. This object is not a valid target.

The card should expand to the full decision trace, but the operator should not have to interpret a rule table during a high-tempo task.

## Gap analysis against the current Sentinel implementation

The existing workspace already has several strong foundations:

- clear separation of task parameters, current context, engine result, policy set, and decision trace;
- explicit outcomes for eligible, restricted, approval, indeterminate, and ineligible;
- accumulated constraints and revalidation triggers;
- visible policy version and context age;
- source and rationale for matched rules;
- a conservative "most restrictive applicable effect" combination rule.

The main gaps are:

| Area | Current state | Needed next |
|---|---|---|
| Authoring | Policy set is read-only; Propose change is only a notification | Governed settings workspace and editable draft |
| Rule model | Core logic is hard-coded in `roeEngine.ts`; live rules are minimal expression/action records | Versioned, source-linked, scoped policy objects |
| Comparison | One proposal is evaluated at a time | Compare two to four viable packages against commander criteria |
| Governance | Version label and signed status are visual only | Reviewers, signatures, effective time, approval chain, audit |
| Distribution | No policy rollout model | Entity/unit delivery, acknowledgement, freshness, retry, rollback |
| Testing | Manual parameter changes only | Saved scenarios, expected outcomes, coverage, impact simulation |
| Inheritance | UI states that higher restrictions cannot be weakened | Enforced authority hierarchy with conflict diagnostics |
| Integration | ROE is a separate workspace | Effective ROE card on target, task, map object, and engagement workflow |
| Offline behavior | Context freshness exists | Signed cached bundle, expiry, fail-safe behavior, resync diff |
| Explanation | Matched-rule trace exists | Why-not/what-must-change explanation and version-to-version diff |

Relevant current files:

- `src/components/RoePolicyWorkspace.tsx`
- `src/policy/roeEngine.ts`
- `src/store/policySlice.ts`

## Suggested implementation sequence

### P0 - Demonstrate the stakeholder requirement

1. Create the ROE Settings route.
2. Introduce a versioned `RoePackage` with scope, source, authority, lifecycle state, and rules.
3. Add package cloning and a structured rule editor.
4. Add the comparison matrix with two to five commander criteria and hard gates.
5. Add review/approve/publish states.
6. Add a rollout view showing every affected entity and its policy serial.
7. Add a compact effective-ROE card to the task/target workflow.

### P1 - Make changes safe

1. Add overlap, gap, contradiction, expiry, and authority validation.
2. Add scenario tests and impact simulation.
3. Add package diff, audit history, rollback, and recall.
4. Add offline caching, acknowledgement, retry, and re-synchronization behavior.
5. Add phase transitions and scheduled activation.

### P2 - Add recommendation support

1. Generate viable packages or parameter alternatives.
2. Rank only after hard gates.
3. Explain the dominant trade-offs and uncertainty.
4. Record the recommendation, evidence, and human decision separately.
5. Monitor drift between modeled assumptions and live context.

## P0 acceptance criteria

- A commander can clone the active package, edit a scenario-specific rule, and see the affected scope before saving.
- Higher-authority prohibitions cannot be weakened by a lower-authority editor.
- The system identifies gaps, overlaps, and contradictory outcomes before review.
- Two or more viable packages can be compared using two to five named criteria.
- Each score links to its evidence and freshness; hard-gate failures are never hidden inside an aggregate score.
- Approval captures the authority, timestamp, package hash/serial, and effective period.
- The rollout view shows every intended entity as pending, delivered, acknowledged, active, stale, failed, or offline.
- An offline entity continues using its last valid signed package and exposes its expiry/fail-safe state.
- An operator can identify the effective outcome, controlling rule, and next action from the task or target screen without opening Settings.
- Every evaluation can be reconstructed from the policy serial, inputs, data timestamps, matched rules, and human decisions.

## Recommended design decision

Use the radar/pentagon only as an optional summary thumbnail. Make the primary commander tool a **gated comparison matrix with aligned power bars and explicit differences**, backed by a **versioned settings and rollout workflow**. This is more consistent with military course-of-action comparison, easier to read accurately, and better suited to showing why one package is viable, what it trades away, and whether it has actually reached every entity.
