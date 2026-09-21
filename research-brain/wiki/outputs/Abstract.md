---
title: Abstract
status: evidence_checked_draft
updated: 2026-09-20
word_count_including_citation_markers: 250
tags: [report, abstract]
---

# Abstract

Effective drone defence requires operators to translate rapidly changing threat information into coordinated action. As hostile drone numbers increase, fragmented displays and individual aircraft tasking can constrain the ability to direct an effective response. Sentinel addresses this coordination problem through a command-and-control workbench for supervising multiple drones from a shared operational picture. It brings fleet status, tactical maps, aircraft details, and simulated viewpoints into one workspace, enabling an operator to manage patrols, issue group movement commands, and initiate interception without manually piloting each aircraft. A shared mission state keeps these views consistent, while explicit operator controls preserve responsibility for tasking decisions. Saved scenarios and timed events support repeatable demonstrations, and recorded commands and outcomes make system behaviour inspectable [1,2]. In a simulated twenty-versus-twenty scenario, the workbench supported twenty friendly drones alongside twenty hostile scripted aircraft and recorded twenty interception outcomes under predefined simulation rules. The demonstration exercised group tasking and concurrent engagements while retaining individual aircraft inspection, command status, and fleet availability. Separate recovery checks verified responses to interrupted connections, delayed information, and uncertain command acknowledgements. Stale positions remain visibly frozen until fresh simulation data becomes available [2,3]. These results demonstrate the feasibility of supervising a coordinated counter-drone response through one interface, with the operator directing fleet behaviour rather than managing each aircraft independently. The operational implication is a practical foundation for managing larger engagements while maintaining situational awareness and human control. The demonstrated scope remains software simulation; real aircraft integration and measured improvements in operator workload require further validation.

## References

[1] Sentinel Team, “Current architecture,” internal project documentation. Accessed: Sep. 20, 2026. [Online]. Available: [architecture](../../raw/repository/docs/architecture.md).

[2] Sentinel Team, “Performance, stability and 20v20 result,” internal verification report. Accessed: Sep. 20, 2026. [Online]. Available: [archived report](../../raw/repository/docs/reports/performance-stability.md).

[3] Sentinel Team, “Recovery and authority verification,” internal verification ledger. Accessed: Sep. 20, 2026. [Online]. Available: [recovery ledger](../../raw/repository/docs/integrated-acceptance/RECOVERY.md).

## Editorial notes

The single paragraph contains 250 whitespace-delimited words including its two citation clusters. The prior Word verification applied to the same prose before the citation-coverage repair; Word was not rerun during this audit. The heading, bibliography, and this note are excluded. Citation numbers are local to this abstract; reconcile them with the full report bibliography when inserting it.

This revision follows the user's request to centre the problem, approach, operational quantitative result, and implication. The 20v20 demonstration replaces cached scenario-validation timing as the headline. Twenty simulated outcomes are a capacity/workflow result under the simulator's mutual-loss model, not a real-world interception success rate. The independent archived run records forty unique participants, twenty distinct assignments, and forty non-operational entities; it is corroborated by later recovery/regression evidence.

No verified detection-to-tasking or deployment-time measurement was found. Historical 91 ms and 113 ms five-member command samples came from a no-hostile movement case and cannot support an interception timing claim. The abstract therefore does not say that deployment is instantaneous. Benchmark and display caveats remain in the quantitative evidence page; they have not been removed from the research record.

The provided Word research draft contributed problem framing but was not treated as proof of its proposed capabilities or external claims. See [[wiki/topics/Quantitative results|Quantitative results]] and [[wiki/topics/Claims and gaps|Claims and gaps]].

## As carried into the submission draft

[[wiki/sources/Report draft V2|Report draft V2]] carries this prose onto its cover
page with three changes: it is split into three paragraphs, four phrases are
reworded, and **both citation clusters were removed**. The result is 249 words,
still within the 250-word cover requirement.

Removing `[1,2]` and `[2,3]` leaves the two evidence-bearing sentences — the
twenty recorded outcomes and the recovery checks — without pointers to the
architecture, performance and recovery records above. The note in this page's
editorial section had asked for those markers to be renumbered into the report
bibliography, not deleted. The guidelines PDF does not require citations in a
cover abstract, so this is an editorial choice rather than an error; it is
recorded so the choice is visible.

The draft also substitutes "twenty hostile, simulated aircraft" for "twenty
hostile scripted aircraft". Both are accurate, but "scripted" is the more precise
word, because those twenty entities are observation-only rather than operator
controlled.
