# Contract package 1.7 — D2 horizontal boundaries

World and stream are **1.6**. Boundary-aware scenario content/revisions/receipts and the scenario review use **1.1**. Existing scenario 1.0 values retain strict legacy reading and their exact canonical content; adding a boundary creates a new revision. Interactive/status **1.3**, command receipts **1.2** and SQLite **4** are unchanged. Backend and frontend deploy together.

`ScenarioContent` optionally contains the paired `boundaries` and `boundaryRuleVersion: local-boundary-v1`. Each of at most 16 boundaries has a distinct draft ID, name, type and 3–32 unclosed horizontal vertices. Types are untyped, annotation, friendly, patrol and restricted. No holes or multipolygons. Patrol must be convex; other typed simple polygons may be concave. Geometry stays within the existing ±5 km local frame; a 1 mm metric tolerance makes edge contact inclusive. Untyped content may save but cannot run. Restricted source-owned starting positions prevent Run. Annotation has no rules, Friendly records future protection intent, and automatic Patrol remains unavailable.

New custom runs freeze source-owned generic Zone records and `boundaryRules` mapping their run-scoped zone IDs to the typed meaning. Rule definitions belong to the saved run snapshot, never a mutable scenario head. Restricted movement checks the whole group segment before replacement and every next authoritative step. Existing ENDPOINT_INVALID receipts explain refusals; no new operation, grant or execution owner is introduced. Hidden overlays never disable enforcement.

Strict world 1.5 reading precedes in-memory adaptation to 1.6. Packages 1.0–1.6 and source specifications remain archived unchanged. Old quick-demo profiles/custom definitions have no boundary rules. Versioned JSON fits the existing immutable SQLite tables; no storage migration or historical receipt rewrite is required. The existing SQLite upgrade chain remains tested.

See [decisions](../../../docs/d2/CONTRACT_DECISIONS.md) and [review evidence](../../../docs/d2/REVIEW.md).
