# Recording and validation compatibility

## Internal storage

The public world/command contracts and historical canonical JSON are unchanged.
SQLite schema 5 adds an internal storage representation only. Frame and interactive
checkpoint columns accept their original TEXT or an envelope stored with SQLite's
BLOB storage class; the existing declared column affinity does not coerce a bound
binary value into text.

Envelope v1 is `SNTLZ`, version byte `01`, big-endian 32-bit decoded byte length,
32-byte SHA-256 of the original UTF-8, then one zlib stream. Level 1 is used only
for payloads from 1 KiB through 16 MiB when the complete envelope is smaller.
Other valid payloads retain TEXT, including larger legacy-capacity payloads.
Decoding bounds both encoded input and output, rejects unsupported versions,
truncation, trailing/concatenated streams, length/hash mismatch and invalid UTF-8.
It never uses an unbounded decompression flush. Existing version-specific strict
frame readers validate the decoded JSON before historical adaptation. Checkpoints
retain their existing JSON parser and consuming recovery logic; the repository
does not have an independent strict checkpoint-schema validator. The new envelope
verifies exact bytes and integrity before either path consumes them, and does not
claim to add semantic checkpoint validation that the baseline lacked.

The first binary write marks `PRAGMA user_version=5` in the enclosing transaction.
Frame/event/checkpoint/receipt writes still commit atomically before publication,
using synchronous FULL WAL. Production checkpoint callers must own that outer
transaction; the low-level method is not a standalone transaction API. Existing
TEXT rows are never rewritten. No operator database was opened or migrated.
An old binary only supporting schema 4 must refuse schema 5; downgrade requires
a separately authorized export/restore workflow, not editing the marker.

Recovery tests cover mixed TEXT/BLOB histories, old strict readers, malformed
envelopes, rollback of the first version marker, process termination in the first
transaction and during an update of existing committed frame/checkpoint data.
Deterministic baseline goldens compare every canonical frame, event, checkpoint,
scenario revision/run and receipt for default/Sydney forty-unit lifecycle runs,
including duplicate create, lease expiry, explicit reclaim and persisted End.

## Saved-revision analysis

The cache stores pure complete nominal analysis, not a review/admission response.
Its key includes the canonical verified saved revision, complete content,
`saved-scenario-analysis-v1`, applicable unit-profile values, cruise defaults and
simulation step duration. Rule or algorithm changes must bump the rule version.
The LRU is bounded to eight entries and 2 MiB of canonical result text. Callers
receive independently decoded values. Entries too large are not retained.

Complete nominal analysis uses private scenario content and yields on the owner
loop between nominal ticks after approximately 2 ms of work. One indivisible
nominal tick can exceed that target; it is not a real-time scheduling guarantee.
The live simulation loop and fixed-step semantics remain unchanged. An async gate
coalesces requests. Cancellation discards the private partial plan at a yield;
shutdown waits for the active analysis and clears retained entries. No analysis
thread/process or unbounded executor queue remains. The endpoint resolves
the saved revision before analysis and computes fresh admission/checked-at state
afterwards. No response is marked complete early. Run keeps its existing complete
validation, frozen scenario ownership and transactional idempotency paths.

Cache tests change geometry, boundaries, units, profiles, routes/actions,
dependencies and revision identity, exercise rule/catalog changes, bounds,
mutation isolation, concurrent coalescing, real-loop yielding and repeated cancellation. Dirty editor
state and pending Save/Run/Apply/Stop identities remain frontend-owned and are
not cached here.

## Details identity

Only `unitProfiles[entityId].id` selects a supplied image: `sting-v1` selects
STING and `hornet-10-v1` selects the quadcopter. Affiliation, display names and
list position are never evidence of model identity. The same supported profile
has the same image across permitted affiliations. Current placement rules do
not support hostile STING; no rule is changed to create that UI test case.
Unsupported profiles and historical frames without reliable explicit identity
show `No reference image assigned`; a failed asset shows `Reference image
unavailable`. Both retain the image well's dimensions.

The original PNGs are copied unchanged into `frontend/src/assets/units`. CSS
contain framing adds no crop to the supplied images; some airframe edges are
already clipped in the originals. Their static-reference labels do not imply a
live camera feed or new telemetry. Existing silhouette glyphs remain separate.
