"""Export the backend draft schema without creating a FastAPI application."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend/drafts'))
from domain import WorldFrame
schema=WorldFrame.model_json_schema(by_alias=True)
schema.update({'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:sentinel:world:0.1-draft'})
path=ROOT/'contracts/sentinel/world.schema.json'
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(schema,indent=2)+'\n',encoding='utf-8')
