"""Command-line entry point. The engine writes portable files outside the app web root."""

import argparse
import hashlib
import os
import platform
import shutil
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path

from . import VERSION
from .analytics import analytical_tables, opportunities
from .commerce import Commerce, campaign_results
from .delivery import (FILES, dictionary, dimensions_for_export, import_tables, verify_workbook,
                       write_csv, write_json, write_parquet, write_workbook)
from .fixtures import fixture_sets
from .journey import plan_customers, simulate_campaigns
from .model import BRANDS, ROOT, dimensions, load_config, quota
from .reports import write_reports
from .scenarios import evaluate_scenarios
from .validation import validate

REPOSITORY = ROOT.parent


def elapsed(started):
    return round(time.perf_counter()-started,3)


def peak_memory_mib():
    if sys.platform!="win32":
        import resource
        scale = 1024**2 if sys.platform=="darwin" else 1024
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/scale,2)
    import ctypes
    from ctypes import wintypes

    class ProcessMemoryCounters(ctypes.Structure):
        _fields_ = [("cb",wintypes.DWORD),("PageFaultCount",wintypes.DWORD)] + [
            (name,ctypes.c_size_t) for name in ("PeakWorkingSetSize","WorkingSetSize","QuotaPeakPagedPoolUsage",
                                               "QuotaPagedPoolUsage","QuotaPeakNonPagedPoolUsage","QuotaNonPagedPoolUsage",
                                               "PagefileUsage","PeakPagefileUsage")]
    data=ProcessMemoryCounters()
    data.cb=ctypes.sizeof(data)
    ctypes.windll.kernel32.GetCurrentProcess.restype=wintypes.HANDLE
    memory_info=ctypes.windll.psapi.GetProcessMemoryInfo
    memory_info.argtypes=(wintypes.HANDLE,ctypes.POINTER(ProcessMemoryCounters),wintypes.DWORD)
    if memory_info(ctypes.windll.kernel32.GetCurrentProcess(),ctypes.byref(data),data.cb):
        return round(data.PeakWorkingSetSize/1024**2,2)
    return None


def engine_version_digest():
    out=hashlib.sha256()
    for file in sorted(Path(__file__).resolve().parent.glob("*.py")):
        out.update(file.name.encode())
        out.update(file.read_bytes())
    return out.hexdigest()


def simulate(conf,catalog,start,end,reference,profile,counts,shard=""):
    started=time.perf_counter()
    timings={}
    stores,stock,op_events,calendar,context=dimensions(conf,catalog,start,end,counts[1])
    customers,truth,schedules=plan_customers(conf,stores,context,stock,start,end,reference,*counts,shard)
    timings["dimensions_and_journeys_seconds"]=elapsed(started)
    stage=time.perf_counter()
    campaigns,assignments,stages=simulate_campaigns(conf,customers,truth,schedules,context,start,end,shard)
    com=Commerce(conf,stock,stores,context)
    second_p,trials=com.calibrate(customers,truth,schedules)
    commercial=None
    for attempt in range(4):
        commercial=com.execute(customers,truth,schedules,second_p,end,shard)
        ticket=sum(t["net_brl"] for t in commercial["transactions"])*100/counts[1]
        trials.append(dict(second_drink_probability=second_p,observed_ticket_cents=round(ticket,4),attempt=attempt+1))
        target=conf["target_ticket_cents"]
        if abs(ticket-target)<=target*conf["ticket_tolerance"]:
            break
        low,high=conf["basket"]["second_drink_bounds"]
        second_p=max(low,min(high,second_p+(target-ticket)/3100))
    timings["campaigns_calibration_and_orders_seconds"]=elapsed(stage)
    stage=time.perf_counter()
    coupons,events,results=campaign_results(conf,campaigns,assignments,stages,commercial["transactions"],shard)
    analytics,labels=analytical_tables(conf,stock,stores,customers,commercial,campaigns,results,start,end)
    analytics["opportunities"]=opportunities(analytics["customer_metrics"])
    main=dict(customers=customers,**dimensions_for_export(conf,stores,stock,calendar,start,end))
    for name in ("transactions","transaction_items","transaction_addons","payments","transaction_discounts"):
        main[name]=commercial[name]
    extra=dict(loyalty_accounts=commercial["loyalty_accounts"],loyalty_events=commercial["loyalty_events"],campaigns=campaigns,
               campaign_audiences=[dict(assignment_id=a["assignment_id"],campaign_id=a["campaign_id"],customer_id=a["customer_id"],
                                        arm=a["arm"],eligibility_date=a["assigned_date"],eligible=True) for a in assignments],
               campaign_events=events,campaign_results=results,coupons=coupons,experiment_assignments=assignments,
               operation_events=op_events,store_day_context=[{k:v for k,v in r.items() if k!="weight"} for r in context.values()],
               **analytics)
    manifest,scenarios=evaluate_scenarios(conf,main,extra)
    timings["analytics_and_scenarios_seconds"]=elapsed(stage)
    stage=time.perf_counter()
    summary,checks=validate(conf,profile,counts,main,extra,truth,labels,start,end,reference,context,scenarios)
    timings["validation_seconds"]=elapsed(stage)
    return main,extra,truth,labels,manifest,scenarios,summary,checks,timings,trials


def report_base(args,conf,digest,summary,checks,timings,trials):
    from importlib.metadata import version

    return dict(generator_version=VERSION,generator_sha256=engine_version_digest(),configuration_sha256=digest,
                profile=args.profile,as_of=conf["as_of"],period_start=conf["period_start"],period_end=conf["period_end"],
                seed=conf["seed"],python=sys.version.split()[0],platform=platform.platform(),
                dependencies={k:version(k) for k in ("XlsxWriter","openpyxl","pyarrow")},
                business=summary,checks=checks,timings=timings,calibration_trials=trials,
                import_test="execução separada no VM JavaScript; consulte import_test.json se disponível",
                platform_dashboard_benchmark="não executado",supabase_test="não executado")


def assert_checks(checks):
    failures=[c for c in checks if c["status"]!="PASS"]
    if failures:
        for c in failures:
            print(f'FAIL {c["check_id"]}: {c["observed"]!r} | esperado {c["expected"]!r}',file=sys.stderr)
        raise ValueError(f"{len(failures)} critérios reprovados.")


def export_profile(args,path,config_path,conf,data,digest):
    stage=time.perf_counter()
    main,extra,truth,labels,manifest,scenarios,summary,checks,timings,trials=data
    assert_checks(checks)
    fixtures=fixture_sets(conf["organization_id"],main["calendar"][0]["date"],main["calendar"][-1]["date"])
    raw,identity,exceptions,raw_manifest,identity_pairs=fixtures
    metadata=dict(profile=args.profile,generator_version=VERSION,generator_sha256=engine_version_digest(),
                  config_sha256=digest,seed=conf["seed"],as_of=conf["as_of"],period_start=conf["period_start"],
                  period_end=conf["period_end"],timezone=conf["timezone"],currency=conf["currency"],
                  scope="amostra sintética de compras identificadas",outbound_messaging_enabled=False)
    main["simulation_metadata"]=[dict(parameter=k,value=str(v)) for k,v in metadata.items()]
    main["validation_summary"]=[dict(check_id=c["check_id"],status=c["status"],observed=str(c["observed"]),
                                     expected=str(c["expected"])) for c in checks]
    imports=import_tables(main,extra)
    workbook_groups=dict(gold=main,import_=imports,extended=extra,raw=raw,identity=identity,exceptions=exceptions)
    workbook_groups["dictionary"]=dict(dicionario=dictionary({**workbook_groups,
        "ground_truth":dict(customer_behavior_truth=list(truth.values()),predictive_labels=labels)}))
    verified={}
    for key,grouped in workbook_groups.items():
        file=path/FILES["import" if key=="import_" else key]
        write_workbook(file,grouped)
        verified[file.name]=verify_workbook(file,grouped)
    write_parquet(path/"ground_truth/customer_behavior_truth.parquet",list(truth.values()))
    write_parquet(path/"ground_truth/predictive_labels.parquet",labels)
    write_json(path/"ground_truth/scenario_manifest.json",manifest)
    write_json(path/"ground_truth/scenario_evaluation.json",scenarios)
    write_json(path/"ground_truth/quality_error_manifest.json",raw_manifest)
    write_json(path/"ground_truth/identity_expected_matches.json",identity_pairs)
    write_json(path/"config/smoov_config.json",conf)
    for f,name in ((config_path.parent/conf["catalog_file"],conf["catalog_file"]),
                   (config_path.parent/"simulation_assumptions.json","simulation_assumptions.json")):
        if f.exists():
            shutil.copyfile(f,path/"config"/name)
    timings["workbook_export_and_reopen_seconds"]=elapsed(stage)
    report=report_base(args,conf,digest,summary,checks,timings,trials)
    report.update(workbooks_reopened=verified,peak_process_working_set_mib=peak_memory_mib(),
                  file_bytes={f.relative_to(path).as_posix():f.stat().st_size for f in path.rglob("*") if f.is_file()},
                  quality_fixtures=dict(raw_errors=len(raw_manifest),identity_pairs=len(identity_pairs),
                                        exception_orders=len(exceptions["exception_orders"])))
    write_json(path/"reports/validation_report.json",report)
    write_reports(path,report,scenarios,extra)
    return report


def export_partitioned(args,path,config_path,conf,catalog,start,end,reference,counts,digest):
    n_customers,n_orders=counts
    blocks=[min(10000,n_customers-i) for i in range(0,n_customers,10000)]
    all_orders=quota(n_orders,blocks)
    summaries=[]
    for i,(size,orders) in enumerate(zip(blocks,all_orders),1):
        shard=f'P{i:03}-'
        data=simulate(conf,catalog,start,end,reference,args.profile,(size,orders),shard)
        main,extra,truth,labels,manifest,scenarios,summary,checks,timings,trials=data
        assert_checks(checks)
        part=path/"partitions"/shard.rstrip("-")
        for collection,tables in (("gold",main),("extended",extra),("import",import_tables(main,extra))):
            for name,rows in tables.items():
                write_csv(part/collection/f"{name}.csv.gz",rows)
        write_parquet(part/"ground_truth/customer_behavior_truth.parquet",list(truth.values()))
        write_parquet(part/"ground_truth/predictive_labels.parquet",labels)
        write_json(part/"ground_truth/scenario_manifest.json",manifest)
        write_json(part/"ground_truth/scenario_evaluation.json",scenarios)
        report=report_base(args,conf,digest,summary,checks,timings,trials)
        write_json(part/"validation_report.json",report)
        summaries.append(dict(partition=shard.rstrip("-"),customers=size,orders=orders,net_brl=summary["net_brl"],
                              ticket_brl=summary["ticket_brl"],status="PASS"))
        print(f"{shard} {size} clientes, {orders} compras",flush=True)
        del data,main,extra,truth,labels,manifest,scenarios
    write_json(path/"config/smoov_config.json",conf)
    shutil.copyfile(config_path.parent/conf["catalog_file"],path/"config"/conf["catalog_file"])
    aggregate=defaultdict(set)
    for dim in ("organizations","stores","calendar","products","product_variants"):
        aggregate["dimension_keys"].add(dim)
    report=dict(profile=args.profile,partitions=summaries,customers=n_customers,orders=n_orders,
                net_brl=round(sum(s["net_brl"] for s in summaries),2),
                dimensions_repeated_by_partition=sorted(aggregate["dimension_keys"]),
                note="Indicadores e experimentos por partição. Para totais da rede, consolide fatos pelos IDs e deduplique dimensões estáveis.")
    write_json(path/"partition_manifest.json",report)
    return report


def run(args):
    config_path=Path(args.config).resolve()
    conf,catalog,start,end,reference,counts,digest=load_config(config_path,args.profile,args.as_of)
    path=Path(args.out).resolve() if args.out else REPOSITORY.parent/"smoov_demo_outputs"/args.profile
    if path==REPOSITORY or REPOSITORY in path.parents:
        raise ValueError("A saída precisa estar fora da raiz servida pela plataforma.")
    if path.exists():
        raise FileExistsError(f"Destino existente. Use --out com uma pasta nova: {path}")
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=path.parent,prefix=f".{path.name}-") as tmp:
        ready=Path(tmp)/"bundle"
        ready.mkdir()
        if counts[0]>10000:
            report=export_partitioned(args,ready,config_path,conf,catalog,start,end,reference,counts,digest)
        else:
            data=simulate(conf,catalog,start,end,reference,args.profile,counts)
            print(f'Gerado: {data[6]["orders"]} pedidos e ticket R$ {data[6]["ticket_brl"]:.2f}',flush=True)
            report=export_profile(args,ready,config_path,conf,data,digest)
        ready.rename(path)
    print(f"Arquivos verificados em {path}",flush=True)
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile",choices=("micro","smoke","demo","real-scale","stress","enterprise"),default="demo")
    parser.add_argument("--config",type=Path,default=BRANDS/"smoov_config.json")
    parser.add_argument("--as-of",help="Data de referência ISO que redefine os 12 meses completos anteriores.")
    parser.add_argument("--out",help="Pasta nova fora da raiz do app.")
    run(parser.parse_args())


if __name__=="__main__":
    main()
