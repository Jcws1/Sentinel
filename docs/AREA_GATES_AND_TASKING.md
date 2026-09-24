# Area gates and Monitor / Respond / Support tasking

This feature is simulation-only decision support. It preserves the read-only
Observe / Orient copilot; its recommendation cards are a separate deterministic
step toward an operator decision. A card is not evidence that a drone moved.

## Drawn operating area

Use the existing boundary drawing tool. **Keep In** confines controlled friendly
drones to one horizontal polygon; **Restricted** is the existing no-entry / avoid
polygon. Friendly still excludes engagement, and Patrol still specifies a loop;
neither is a Keep In gate. All footprints apply at all simulated heights. Only
one Keep In polygon is supported in this POC.

The scenario review rejects a controlled drone outside/on Keep In, or more than
one Keep In area. Live activation rejects a new Keep In polygon that excludes a
currently controlled drone. The simulator checks the entire straight segment,
including concave exits and edge contact, at admission and on every movement
step. It generates no detour and never teleports actors. Hostile observation
tracks are not confined by our Keep In gate; Restricted still applies to source
movement. Changing a live gate fails incompatible ongoing controlled movement.

These guards are **not** proof that an external Wedgetail aircraft, its API, or
any real autopilot enforces the polygon.

## Recommendation cards

`POST /api/missions/{mission_id}/tasking-advice` reads the latest committed frame;
callers may supply `frameId` to require an exact-frame match. The live UI omits
it so a fast-moving simulator does not make read-only advice unusable. An
optional `focusZoneId` selects a marked observation area. It returns five stable cards: MONITOR, RESPOND,
RESTORE_VISIBILITY, RESTORE_LINK and ROTATE_ASSET, grouped under Monitor,
Respond and Support. It never writes a world frame or executes a command.
Every response includes the committed frame and live boundary revision.

- **Monitor:** selects the nearest eligible controlled drone to a marked area
  for further view planning. This is not a validated camera vantage: camera
  pose/FOV, building occlusion and route clearance are not provided yet.
- **Respond:** calculates a stable maximum one-to-one matching using the
  simulator's current Intercept proximity and boundary predicates. It reports
  target shortfall and does not claim a screen reserve while demand is unmet.
  The pairing is advisory, not a target-specific dispatch.
- **Restore visibility:** requires an explicitly unavailable camera sensor and
  an available controlled camera asset before suggesting an alternative.
- **Restore link:** requires an explicitly unavailable link sensor and a
  controlled asset with the `relay` capability code. Stale source updates alone
  do not prove a radio-link fault; relay coverage is not inferred.
- **Rotate asset:** requires an active task with an unavailable assigned asset
  and a free controlled asset covering its declared capability codes. Endurance
  and task-transfer authority are not inferred.

Clicking a card opens **Confirm** and **Cancel**. Only a candidate Respond card
can currently enable Confirm. Opening it obtains a fresh validated simulator
suggestion for the exact proposed assets; Confirm submits that suggestion
through the existing intent/command/receipt flow. The supported effect is
**enable proximity Intercept policy**, not dispatch to the advisory target
pairings. Server-side expiry, ownership, capability, geometry and current-state
checks still apply. Inspect Activity for member outcomes. Monitor and Support
cards cannot launch until their camera/relay/task-transfer commands and evidence
models are implemented; their Confirm control stays disabled.

The copilot may explain these records, but no model output can override the
deterministic gate or create command authority. Simulated GNSS degradation and
erroneous-position blips are a later demo feature; they are not generated here.
