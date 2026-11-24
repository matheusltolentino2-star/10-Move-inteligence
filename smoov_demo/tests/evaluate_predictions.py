"""Score platform detections against the held-out scenario manifest."""

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

from generator.scenarios import classifier_scores


def evaluate(manifest,predictions,k):
    by_scenario=defaultdict(list)
    for row in predictions:
        by_scenario[row["scenario_id"]].append((float(row["score"]),row["entity_id"]))
    scenario_ids={r["scenario_id"] for r in manifest}
    unknown=set(by_scenario)-scenario_ids
    if unknown:
        raise ValueError("Cenários desconhecidos: "+", ".join(sorted(unknown)))
    results=[]
    for scenario in manifest:
        token=scenario["scenario_id"]
        expected=set(scenario["positive_entities"])
        if not expected:
            continue
        ranked=sorted(by_scenario[token],key=lambda r:(-r[0],r[1]))
        scores=classifier_scores(expected,(entity for _,entity in ranked),k)
        results.append(dict(scenario_id=token,expected_positives=len(expected),k=k,
                            predicted=scores["tp"]+scores["fp"],**scores))
    return results


if __name__=="__main__":
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument("manifest",type=Path)
    cli.add_argument("predictions",type=Path,help="CSV UTF-8 com scenario_id,entity_id,score")
    cli.add_argument("--k",type=int)
    args=cli.parse_args()
    if args.k is not None and args.k<=0:
        cli.error("--k deve ser positivo")
    manifest=json.loads(args.manifest.read_text(encoding="utf-8"))
    with args.predictions.open(encoding="utf-8-sig",newline="") as file:
        predictions=list(csv.DictReader(file))
    print(json.dumps(evaluate(manifest,predictions,args.k),ensure_ascii=False,indent=2))
