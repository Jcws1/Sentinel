# Sentinel Research Brain

Start with [[index|the index]]. This is your persistent LLM-maintained second
brain, currently focused on Sentinel. You curate sources and direct analysis;
the agent maintains linked notes and evidence.

## Start here

1. Open `C:\Archive\Coding\Sentinel3\research-brain` as a vault in Obsidian or a
   folder in an editor. Existing settings are preserved; no extra plugin is needed.
2. Browse [[index|the index]] for sources, topics, entities and saved outputs.
3. Give the agent a source path and say "Ingest this using CLAUDE.md." Optional
   `inbox/` staging is created when first needed.
4. Review the summary, affected pages and gaps. Redirect emphasis in conversation.
5. Ask "What does the wiki support about ...?" and periodically "Lint the wiki."

Agents start with [[CLAUDE|the authoritative schema]] and the index.
[[AGENTS|AGENTS.md]] points other agents to the same rules. The folder does not
monitor sources or ingest automatically between sessions.

## Folder conventions

| Path | Purpose |
|---|---|
| `raw/inputs/` | Byte-exact supplied files |
| `raw/repository/` | Repository snapshots preserving relative paths |
| `raw/measurements/` | Recorded measurements |
| `raw/assets/` | Deliberately captured source attachments, when needed |
| `raw/manifest.json` | Provenance, size and SHA-256 per snapshot |
| `wiki/sources/` | Source summaries and limitations |
| `wiki/topics/` | Accumulating synthesis and open questions |
| `wiki/entities/` | Hubs for recurring systems/components |
| `wiki/outputs/` | Saved answers, reports, comparisons and audits |
| `index.md` / `log.md` | Catalog / append-only history |
| `tools/` | Snapshot and verification tools |

Changed sources become new dated snapshots. Raw bytes and historical log entries
are preserved. `.gitattributes` protects snapshot line endings.

## Worked example

See [[wiki/topics/Wiki workflow|Wiki workflow]] for a completed ingest.

Useful requests: "Ingest this paper and connect it to our design decisions",
"Compare proposed and demonstrated capabilities", "Save this comparison", or
"Lint the wiki and identify the three highest-value evidence gaps".

Run from the vault root:

```powershell
python tools/verify_snapshots.py
python tools/lint_links.py
```

These check integrity and structure; factual verification still requires sources.
Wiki maintenance does not imply application runs, experiments, commits or publishing.
