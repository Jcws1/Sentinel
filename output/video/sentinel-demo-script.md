# Sentinel: two-minute demonstration script

Draft prepared 19 September 2026. Intended final duration: **1 minute 58 seconds**, including the opening card. Screen recordings of the working Sentinel GUI throughout. This is an editorial and recording plan; no new video or system verification was performed for this draft.

## Basis and scope

Reviewed: `D:/Downloads/DVL_Final_Deliverables_Guidelines (1).pdf`, all four pages, with visual inspection of page 4; current Sentinel source, contract documentation, and existing UI evidence. The attachment is the deliverables guideline, not the team's technical report. Performance claims and test conditions must therefore be reconciled with that report before recording the final narration.

### Requirements from the PDF

- Maximum video length: two minutes.
- Submit an MP4 named `TeamName_Demo.mp4`, plus an unlisted streaming link as backup.
- Opening card: project title, team members, mentor/advisor, and date.
- Footage of the system only. The report carries problem framing, the pitch, and the architecture walkthrough.
- Identify what each clip shows and its conditions, on screen or in narration.
- Label simulated, rendered, animated, staged, re-enacted, or sped-up material on screen when it appears.

The PDF **suggests**, rather than mandates a fixed allocation for, nominal operation, the test environment behind reported results, robustness testing, and failure modes. It says production quality is not scored.

### Editorial recommendation

Use one understandable simulated scenario, followed by a clearly separate connection-loss test and a short view of Conductor. A working software GUI is the system being demonstrated; label its simulated inputs and rendered imagery clearly. Keep the interface visible behind the opening identification card.

The film should let a reviewer see the relationship between an operator action, a change in the simulation, and the displayed status. Five managed drones are enough to make this legible. This recording does not establish performance at hundreds of drones, multi-domain operation, live sensor detection, real vehicle autonomy, secure video transport, or external battlefield-management integration.

## What to keep from the proposed outline

| Proposed material | Recommendation for the submission |
| --- | --- |
| 1. Enter UI and explain its parts | Start in the prepared workspace. Use three short callouts: Fleet, Mission map, Details. Keep orientation brief. |
| 2. Pan, move one drone, select a group, inspect details | Keep. One individual action and one group action demonstrate the interaction pattern. Show the resulting movement and status. |
| 3. Demonstrate boundary types and patrol | Keep a short sequence. Have Restricted and Friendly areas prepared; draw one Patrol boundary on camera. Show a visible boundary response if captured, and then several seconds of actual patrol motion. A boundary being drawn alone does not demonstrate enforcement. |
| 4-7. Incoming tracks, simulated response, viewpoint, outcomes | Keep as one continuous narrative. Identify tracks as simulated inputs. Present the system's existing assignment and outcome displays at a high level. Keep the same run identity and entity labels across cuts. |
| 8. Ten hostiles, fifteen friendlies, LLM choices and reserves | Omit from this two-minute cut. It duplicates the encounter and depends on an unimplemented assistant. Save it for a separate demonstrated scenario once implemented. Do not imply that the current assignment behavior is an LLM decision. |
| 9. Jamming or GNSS-loss fallback | Replace with a controlled GUI-to-backend connection-loss test if that is what can actually be reproduced. Show stale data, frozen viewpoint, and recovery. A disconnected application is not a GNSS-denial or vehicle radio-link test. |
| 10. Vertical Profile, Command Picture, Timeline | Omit the placeholder screens. Use the working Tactical/3D view, Details, Activity, or Conductor execution inspection when relevant. These are not substitutes for claiming the planned features are implemented. |
| 11. Simulator / Conductor | Include. It shows the source of the simulated scenario and timed inputs. End on the saved revision and scheduled actions used for the filmed run. |

## Timed shooting script

The voiceover below is a draft for the indicated footage. Record it after reviewing the captured run. Do not force a success claim if the observed behavior differs. Timecodes are positions in the edited film, not simulation timestamps.

| Time | Footage and framing | Exact draft voiceover | On-screen text |
| --- | --- | --- | --- |
| 00:00-00:05 | Prepared Sentinel workspace behind a restrained opening card. Make all identification details readable. | Sentinel. A screen-recorded demonstration using a local drone simulation. | SENTINEL / [Team members] / Mentor or advisor: [Name] / [Date]. Add LOCAL SIMULATION. |
| 00:05-00:14 | Full workspace, five managed drones visible. Introduce Fleet, the central map, and Details with one short callout at a time. | Five managed drones share one workspace. The fleet list, mission map, and details panel show the current simulation state. | Fleet / Mission map / Details. |
| 00:14-00:28 | One gentle map pan, then a steady frame. Select one drone and show movement; show group selection and its movement. Briefly enlarge the relevant Details values. | The operator selects an individual drone, issues a movement command, then moves a group. Selecting a drone reveals its status, position, speed, and altitude. | Individual and group control. |
| 00:28-00:44 | Briefly identify prepared Restricted and Friendly boundaries. Draw one Patrol area and show the group following it. Include the actual UI response for any boundary effect being claimed. | Restricted and friendly boundaries define different constraints within the simulation. A patrol area gives the selected drones a shared operating region, with their movement visible on the map. | Boundary types / Patrol in progress. |
| 00:44-00:59 | Keep the camera steady as the existing scenario introduces five opposing simulated tracks. Leave their labels and the friendly group readable. | Five opposing tracks enter the simulated scenario. The map shows their positions alongside the managed fleet, giving the operator a common view of the developing situation. | SIMULATED INPUTS / Five opposing tracks. |
| 00:59-01:12 | Show the existing simulated response and its displayed assignments. Give the map enough space for viewers to trace the relationships. Do not add assignment lines that the system did not produce. | The simulation displays assignments for the responding drones. The operator can follow the individual pairings and inspect each drone's status as the response develops. | Simulated coordination. If the captured run proves it: One drone per assigned track. |
| 01:12-01:24 | Open the rendered viewpoint beside the map. Use roughly a 60/40 map-to-view split, with the same named drone identifiable in both. | Alongside the map, a rendered drone viewpoint follows the selected aircraft. The scene and entity overlays are simulated; they are not a live camera feed. | RENDERED DRONE VIEW / NO LIVE CAMERA FEED. Preserve the application's simulation and visibility labels. |
| 01:24-01:34 | Return attention to the map and actual outcome/status panel. Hold long enough to read the result, including any friendly losses or unresolved tracks. | The run records its simulated outcomes and updates the fleet status. The activity panel shows the operator's commands and their reported results. | Recorded simulation outcome. Use only actual run totals if adding counts. |
| 01:34-01:49 | Clearly identify a separate connection-loss test on a run with an active viewpoint. Show the real connection warning and frozen state, then reconnection if captured. | In a separate connection-loss test, the interface marks the last received state as stale and freezes the viewpoint. After reconnection, it displays fresh simulation data. | SEPARATE TEST / GUI-BACKEND CONNECTION INTERRUPTED. Then CONNECTION RESTORED, only when shown. |
| 01:49-01:58 | Show Conductor's saved scenario revision and timed actions corresponding to the main filmed run. End on this readable application view. | Conductor defines the saved scenario and timed events used for this run, making the test setup inspectable. | Test setup / Saved scenario and timed actions. |

Keep `LOCAL SIMULATION` visible throughout simulation footage. For the separate interruption test, retain that context and add the precise fault label. Label any time compression at the moment it occurs, for example `2x playback` or `Later in the same run`.

The coordination narration intentionally does not promise five successful outcomes. If the captured run clearly shows five distinct pairings, the optional callout explains the one-to-one relationship without inventing a result. The current simulation's documented loss rule can mark both participants non-operational; preserve those friendly losses in the footage and any summary.

## Framing and editing

- **Normal layout:** Fleet on the left, the map occupying most of the image, and one supporting panel on the right. Keep map plus one supporting view as the visual focus of each shot.
- **Viewpoint layout:** enlarge the simulated viewpoint enough to read it. The existing UI evidence shows that a narrow sidebar makes it difficult to inspect; temporarily give it about 40% of the available workspace.
- **Camera movement:** establish the area once, then hold the map still while entities move. Use an occasional gentle digital push-in for a status label. Avoid simultaneous map panning, cursor movement, and animated callouts.
- **Action/result continuity:** retain a few seconds after each interaction. Selection highlights, movement, warnings, and outcomes need time to register. Record the interaction and response in the same take where practical.
- **UI explanation:** use three brief callouts instead of annotating every control. Each callout should name one function in a few words. Keep it clear of tracks, counts, warnings, and telemetry.
- **Pauses:** if pausing for orientation, use Sentinel's actual simulation pause and leave the state visible. Label an editorial freeze as a freeze frame.
- **Text:** short captions, high contrast, and consistent placement. Check the exported film at its intended playback size. Keep simulation labels and map/provider credits visible and readable when reframing.
- **Sound:** a measured voiceover is sufficient. Optional quiet instrumental music should not compete with narration. Preserve genuine application alerts if useful; do not invent warning tones or impact sounds as evidence of system behavior.
- **Transitions:** simple cuts. Use a clear caption to separate the interruption test from the main run. Keep simulation clocks and run identifiers intact so edits do not imply one continuous take when footage was captured separately.
- **Pacing:** target 01:58 total. The main script leaves room for brief visual holds. Trim camera travel and repetitive selection before trimming the visible result of an action.

## Record now: practical sequence

1. **Confirm the demonstration build.** Use the build you will actually submit. The source review found working simulation, authoring, boundary, and viewpoint surfaces, but did not launch or retest them. Record a brief rehearsal to confirm the required states in this build.
2. **Prepare one saved scenario.** Use the intended five managed drones and five simulated opposing tracks. Set clear short entity names, prepare the required boundaries and UI layout, and retain the saved revision used for the run. Do not add a new LLM workflow or additional encounter for this cut.
3. **Capture the main scenario continuously.** Allow several seconds of stillness before and after each useful moment. Record more than two minutes of raw footage; the limit applies to the edited deliverable.
4. **Capture the separate interruption test.** Use an active viewpoint and a reproducible application-to-backend disconnection. Record the actual warning, retained state, and recovery. Keep test-control tools out of the final frame. Do not label a backend restart or imagery-provider outage as a vehicle radio failure.
5. **Capture the Conductor view.** Use the same saved revision and action list as the main scenario. This is a test-setup shot, not an architecture diagram or a claim of replay playback.
6. **Assemble the silent cut first.** Follow the timecodes, add short condition labels, then record narration against the edited footage. Adjust statements to the actual results.
7. **Export and watch the complete file.** Suggested editorial settings: 1920x1080, 16:9, 30 fps, MP4/H.264 with clear audio. These settings are suggestions; the PDF specifies only MP4 and the two-minute maximum. Confirm duration, opening identities, readable labels, correct counts, and visible credits. Prepare the required unlisted backup link.

## If a shot is not ready

### Boundary effects

If only authoring can be shown reliably, replace the boundary voiceover with:

> The operator defines restricted, friendly, and patrol areas on the map. Each boundary is named and labelled so its intended role is visible in the scenario.

Do not infer active avoidance or automatic rerouting from the presence of a polygon. If the actual implementation rejects a movement, show that response and describe the rejection accurately.

### Coordination or outcomes

If the filmed run does not visibly expose assignments, omit the one-to-one callout. Use the time for legible individual status changes and recorded command results. If the run does not resolve every track, retain the unresolved result. Do not add composited assignment lines, fabricated success totals, or a new alert banner that appears to be part of Sentinel.

### Connection-loss test

If recovery is not captured, replace the final sentence with:

> The display retains the last received state while the connection is unavailable.

If the interruption test cannot be reproduced, replace the entire 15-second segment with a real unavailable/stale-data or rejected-command case already observable in the application. Match the narration to that case. A staged warning graphic would not show the system handling a failure.

### Planned capabilities

The LLM assistant, Vertical Profile, Command Picture analytics, and Timeline/replay should not consume this submission's running time while unimplemented. A separate concept walkthrough can identify future UI mockups as planned concepts. Secure streaming, GNSS-denied autonomy, multi-domain coordination, operation at hundreds of drones, and external-system integration need their own implementation and evidence before being described as demonstrated here.

## Source notes for this draft

- DVL guideline, page 4, sections 3.1-3.3: video format, scope, labelling, and suggested coverage.
- `frontend/src/features/workspace/PaneHost.tsx` and `viewRegistry.ts`: working views versus placeholder routes.
- `frontend/src/features/conductor/ConductorPane.tsx` and `ScenarioRunReview.tsx`: scenario authoring, saved revisions, validation, launch, and execution inspection. The validation review is not a replay viewer.
- `frontend/src/features/units/BoundaryPanel.tsx`: named boundary types and displayed descriptions of their effects.
- `frontend/src/features/cockpit/CockpitPane.tsx` and `presentation.ts`: rendered viewpoint, simulated overlays, visibility limitations, disconnected/stale/frozen states.
- `contracts/sentinel/v1.10/README.md` and `v1.11/README.md`: simulation scope and recorded outcome semantics. These describe software behavior, not physical performance.
- Existing `docs/d5/REVIEW.md` and `docs/d5/video-overlay-ui-final/` screenshots: prior UI evidence and layout reference, not newly performed tests.

Only this writing artifact was added for the request. Application source and the existing evidence were not modified.
