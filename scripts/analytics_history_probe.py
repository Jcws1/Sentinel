"""Matched cold/warm bounded-history diagnostic on an in-memory recording."""
import asyncio
import gc
import hashlib
import json
import sys
from pathlib import Path
from time import perf_counter

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'backend'),str(ROOT/'backend/tests')]
from test_interactive import Harness
from test_conductor import ready
from app.recording import history
from app.recording.storage_codec import decode_text

async def main():
    output=ROOT/'test-results/phase6-command-picture';output.mkdir(parents=True,exist_ok=True)
    h=Harness()
    report={}
    try:
        data=json.loads((ROOT/'frontend/tests/fixtures/scenario-20v20.json').read_text())
        mid,_,_=await ready(h,data)
        await h.act(mid,'acquire');await h.act(mid,'start')
        for i in range(450):
            if i%25==0:await h.act(mid,'renew')
            h.advance(.2);await h.service.tick()
        anchor=h.authority.read(mid);eid=next(iter(anchor.entities))
        report.update(frames=h.repo.metadata(anchor.recording_id).frame_count,entities=len(anchor.entities),seconds=120)
        rows=h.repo.db.execute('SELECT frame_json,effective_at FROM frames WHERE recording_id=? AND sequence<=? ORDER BY sequence DESC',(anchor.recording_id,anchor.sequence)).fetchall()
        revisions={}
        for row in rows:revisions.setdefault(row[1],row[0])
        texts=[revisions[at] for at in sorted(revisions,reverse=True)[:history.MAX_FRAMES]]
        for label in ['committed','warm1','warm2','warm3','cold-historical','uncached']:
            if label=='cold-historical':h.repo._history_frames.clear()
            gc.collect();start=perf_counter()
            result=(history.project_history(anchor,eid,120,(decode_text(raw) for raw in texts),False) if label=='uncached'
                else h.repo.observed_history(mid,eid,anchor.frame_id,120))
            report[label]={'ms':(perf_counter()-start)*1000,'points':sum(len(s.points) for s in result.segments),'sha256':hashlib.sha256(result.model_dump_json().encode()).hexdigest(),'cache':h.repo._history_frames.inspect()}
        assert len({report[key]['sha256'] for key in ['committed','warm1','warm2','warm3','cold-historical','uncached']})==1
        tag=sys.argv[1] if len(sys.argv)>1 else 'history-cache-probe'
        if not tag.replace('-','').isalnum():raise ValueError('Invalid evidence tag')
        (output/(tag+'.json')).write_text(json.dumps(report,indent=2));print(json.dumps(report))
    finally:
        h.repo.close()

if __name__=='__main__':asyncio.run(main())
