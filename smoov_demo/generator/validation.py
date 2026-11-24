"""Commercial invariants and dataset-level certification."""

from collections import Counter, defaultdict
from statistics import median, pstdev

from .analytics import money, percentile, summarize_orders
from .model import age_on, cents_bps, group, quota

KEYS = {
    "organizations": ("organization_id",), "stores": ("store_id",), "customers": ("customer_id",),
    "product_categories": ("category",), "products": ("product_id",), "product_variants": ("sku",),
    "addons": ("sku",), "addon_rules": ("rule_id",), "sales_channels": ("channel",), "payment_methods": ("payment_method",),
    "calendar": ("date",), "price_history": ("sku","effective_from"), "product_costs": ("sku",),
    "transactions": ("transaction_id",), "transaction_items": ("item_id",), "transaction_addons": ("transaction_addon_id",),
    "payments": ("payment_id",), "transaction_discounts": ("discount_id",), "simulation_metadata": ("parameter",),
    "validation_summary": ("check_id",),
    "loyalty_accounts": ("loyalty_account_id",), "loyalty_events": ("loyalty_event_id",), "campaigns": ("campaign_id",),
    "campaign_audiences": ("assignment_id",), "campaign_events": ("campaign_event_id",), "campaign_results": ("assignment_id",),
    "coupons": ("coupon_id",), "experiment_assignments": ("assignment_id",), "operation_events": ("event_id",),
    "store_day_context": ("store_id","date"), "customer_metrics": ("customer_id",),
    "customer_rfm_snapshots": ("customer_id","snapshot_date"), "customer_cohorts": ("customer_id",),
    "cohort_metrics": ("cohort_dimension","cohort_value","horizon_days"), "lifecycle_movements": ("customer_id","snapshot_date"),
    "store_daily_metrics": ("store_id","date"), "store_monthly_metrics": ("store_id","month"), "store_metrics": ("store_id",),
    "same_store_sales": ("month",),
    "product_metrics": ("sku",), "channel_metrics": ("channel",), "basket_affinity": ("product_a","product_b"),
    "campaign_metrics": ("campaign_id",),"opportunities": ("opportunity","case"),
    "predictive_labels": ("customer_id","cutoff_date"), "customer_behavior_truth": ("customer_id",),
    "clientes": ("cliente_id",), "catalogo": ("sku",), "identity_records": ("record_id",),
    "exception_orders": ("exception_order_id",), "exception_events": ("exception_event_id",),
}
TARGETS = {
    "organization_id":("organizations","organization_id"), "customer_id":("customers","customer_id"),
    "store_id":("stores","store_id"),"first_store_id":("stores","store_id"),"last_store_id":("stores","store_id"),
    "preferred_store_id":("stores","store_id"),"acquisition_store_id":("stores","store_id"),
    "home_store_id":("stores","store_id"),"highest_spend_store_id":("stores","store_id"),
    "sku":("product_variants","sku"),"first_product_sku":("product_variants","sku"),"next_primary_sku":("product_variants","sku"),
    "product_id":("products","product_id"),"category":("product_categories","category"),
    "channel":("sales_channels","channel"),"payment_method":("payment_methods","payment_method"),
    "transaction_id":("transactions","transaction_id"),"item_id":("transaction_items","item_id"),
    "campaign_id":("campaigns","campaign_id"),"first_campaign_id":("campaigns","campaign_id"),
    "loyalty_account_id":("loyalty_accounts","loyalty_account_id"),
    "assignment_id":("experiment_assignments","assignment_id"),"coupon_id":("coupons","coupon_id"),
    "conversion_id":("transactions","transaction_id"),"attributed_transaction_id":("transactions","transaction_id"),
    "redeemed_transaction_id":("transactions","transaction_id"),"exception_order_id":("exception_orders","exception_order_id"),
}


def target(table,field):
    if table in {"clientes","catalogo","transacoes","clientes_raw","itens_raw","arquivo_incompleto","identity_records",
                 "exception_orders","exception_events","campaigns"}:
        return TARGETS.get(field) if table=="exception_events" and field=="exception_order_id" else None
    if table=="basket_affinity" or (table=="addons" and field=="category"):
        return None
    dest=TARGETS.get(field)
    return dest if dest and dest[0]!=table else None


def cents(row,key):
    return round(row[key]*100)


def validate(conf,profile,expected,main,extra,truth,labels,start,end,reference,context,scenarios):
    checks=[]

    def check(key, actual, expected, passed=None):
        passed = actual==expected if passed is None else bool(passed)
        checks.append(dict(check_id=key, status="PASS" if passed else "FAIL", observed=actual, expected=expected))

    gold = main | extra | dict(customer_behavior_truth=list(truth.values()),predictive_labels=labels)
    duplicate, orphan, inconsistent = 0,0,0
    index={}
    for table, rows in gold.items():
        if not rows:
            continue
        fields=KEYS.get(table)
        if fields:
            signatures={tuple(r[f] for f in fields) for r in rows}
            duplicate += len(rows)-len(signatures)
            inconsistent += sum(any(value is None or value=="" for value in sig) for sig in signatures)
        if fields and len(fields)==1:
            index[table,fields[0]]={r[fields[0]] for r in rows}
        schema=set(rows[0])
        inconsistent+=sum(set(r)!=schema for r in rows)
        for field in schema:
            if (table,field) in TARGETS.values() and (table,field) not in index:
                index[table,field] = {r[field] for r in rows}
    for table,rows in gold.items():
        if not rows:
            continue
        for f in rows[0]:
            dest = target(table,f)
            if dest:
                allowed = index.get(dest,set())
                orphan += sum(r[f] is not None and r[f] not in allowed for r in rows)
    check("gold_pk_duplicadas",duplicate,0)
    check("gold_fk_orfas",orphan,0)
    check("gold_schema_pk_obrigatoria",inconsistent,0)
    customers, stores, txs, items, addons, payments, discounts = [main[k] for k in
        ("customers","stores","transactions","transaction_items","transaction_addons","payments","transaction_discounts")]
    customer = {r["customer_id"]:r for r in customers}
    store = {r["store_id"]:r for r in stores}
    sku = {r["sku"]:r for r in main["product_variants"]}
    cost = {r["sku"]: cents(r,"unit_cost_brl") for r in main["product_costs"]}
    tx_by = group(txs,"customer_id")
    by_item=group(addons,"item_id")
    by_tx=group(items,"transaction_id")
    pay_by=group(payments,"transaction_id")
    discounts_by=group(discounts,"transaction_id")
    check("clientes",len(customers),expected[0])
    check("compras_concluidas",len(txs),expected[1])
    check("unidades",len(stores),len(conf["stores"]))
    check("clientes_com_compra",len(tx_by),expected[0])
    counts=Counter(r["store_id"] for r in txs)
    check("cotas_lojas",{k:counts[k] for k in store},{k:r["expected_orders"] for k,r in store.items()})
    age_band=Counter(c["age_group"] for c in customers)
    check("cotas_demograficas",dict(age_band),dict(zip([r[0] for r in conf["age_bands"]],quota(expected[0],[r[3] for r in conf["age_bands"]]))))
    freqs=[len(v) for v in tx_by.values()]
    configured_bands=conf["frequency_bands"]
    check("cotas_de_frequencia",[sum(lo<=n<=hi for n in freqs) for lo,hi,*_ in configured_bands],
          quota(expected[0],[b[2] for b in configured_bands]))
    mult=Counter(min(3,len({t["store_id"] for t in rows})) for rows in tx_by.values())
    check("cotas_multiloja",[mult[i] for i in (1,2,3)],quota(expected[0],conf["multistore_weights"]))
    check("idades_consistentes",sum(age_on(c["birth_date"],reference)!=c["age"] for c in customers),0)
    privacy = sum(not c["is_demo"] or not c["is_synthetic"] or c["outbound_messaging_enabled"] or
                  (c["email"] is not None and not c["email"].endswith("@example.com")) or
                  (c["phone"] is not None and not c["phone"].startswith("DEMO-NR-")) or
                  not c["document_id"].startswith("DEMO-DOC-") for c in customers)
    privacy += sum(o["outbound_messaging_enabled"] or not o["is_demo"] for o in main["organizations"])
    privacy += sum(c["outbound_messaging_enabled"] or not c["is_synthetic"] for c in extra["campaigns"])
    check("violacoes_de_privacidade",privacy,0)
    before_reg,before_open,out_of_hours,wrong_status,viol,financial,stockout,dup_days=0,0,0,0,0,0,0,0
    rules=conf["addon_rules"]
    valid_categories=[conf["core_categories"][i] for i in rules["compatible_core_categories"]]
    for key,rows in tx_by.items():
        dup_days+=len(rows)-len({r["sale_datetime"].date() for r in rows})
    for tx in txs:
        key=tx["transaction_id"]
        date=tx["sale_datetime"].date()
        cli=customer[tx["customer_id"]]
        ctx=context[tx["store_id"],date]
        before_reg+=date<cli["registration_date"]
        before_open+=date<store[tx["store_id"]]["opening_date"]
        hour=tx["sale_datetime"].hour
        out_of_hours+=not(ctx["is_open"] and ctx["opens_at_hour"]<=hour<ctx["closes_at_hour"])
        wrong_status+=tx["status"]!="concluída" or not start<=date<=end or tx["currency"]!=conf["currency"]
        vals=by_tx[key]
        total=lambda k:sum(cents(r,k) for r in vals)
        gross,net,cmv,disc=[cents(tx,k) for k in ("gross_brl","net_brl","cmv_brl","discount_brl")]
        variable=sum(cents(tx,k) for k in ("payment_fee_brl","channel_commission_brl","delivery_subsidy_brl"))
        expected_payment_bps = dict(conf["payment_methods"])
        channels = {r[0]:r[2:] for r in conf["channels"]}
        expected_commission,expected_subsidy = channels[tx["channel"]]
        correct=(
            vals and total("product_gross_brl")==cents(tx,"product_subtotal_brl")
            and total("addons_gross_brl")==cents(tx,"addons_subtotal_brl")
            and total("product_gross_brl")+total("addons_gross_brl")==gross
            and total("discount_allocated_brl")==disc==sum(cents(r,"amount_brl") for r in discounts_by[key])
            and total("net_brl")==gross-disc==net and total("cmv_brl")==cmv
            and cents(tx,"gross_profit_brl")==net-cmv and cents(tx,"contribution_brl")==net-cmv-variable
            and len(pay_by[key])==1 and sum(cents(r,"amount_brl") for r in pay_by[key])==cents(tx,"amount_due_brl")==net
            and sum(cents(r,"fee_brl") for r in pay_by[key])==cents(tx,"payment_fee_brl")
            and cents(tx,"payment_fee_brl")==cents_bps(net,expected_payment_bps[pay_by[key][0]["payment_method"]])
            and cents(tx,"channel_commission_brl")==cents_bps(net,expected_commission)
            and cents(tx,"delivery_subsidy_brl")==expected_subsidy
            and min(gross,net,cmv,disc,variable)>=0)
        financial+=not correct
        for it in vals:
            p=sku[it["sku"]]
            stockout+=p["name"] in (ctx["stockout_families"] or "").split(" | ")
            alist=by_item[it["item_id"]]
            aid_cost,total_add=0,0
            dosages=Counter()
            for add in alist:
                a=sku[add["sku"]]
                dosages[a["subcategory"]]+=add["doses"]
                expected_unit=cents(a,"price_brl")
                total_add+=expected_unit*add["doses"]
                aid_cost+=cost[add["sku"]]*add["doses"]
                financial+=not (expected_unit==cents(add,"unit_price_brl") and add["doses"]>0 and
                                cents(add,"gross_brl")==expected_unit*add["doses"] and
                                cents(add,"cmv_brl")==cost[add["sku"]]*add["doses"])
                viol+=not a["is_addon"]
            size_limit=rules["volume_ml"].get(p["size"].split()[0],0)
            if p["category"]==conf["core_categories"][1]:
                size_limit=rules["protein_category_max"]
            supp=dosages[rules["supplement_group"]]
            viol+=bool(alist) and (p["category"] not in valid_categories or
                    dosages[rules["protein_group"]]>size_limit*it["quantity"] or
                    supp>rules["supplements_max"]*it["quantity"] or
                    dosages[rules["superfood_group"]]>rules["superfoods_max"]*it["quantity"] or
                    (bool(supp) and age_on(cli["birth_date"],date)<18))
            product_gross=cents(p,"price_brl")*it["quantity"]
            financial+=not (not p["is_addon"] and it["quantity"]>0 and cents(p,"price_brl")==cents(it,"unit_price_brl")
                            and product_gross==cents(it,"product_gross_brl") and total_add==cents(it,"addons_gross_brl")
                            and cents(it,"cmv_brl")==cost[it["sku"]]*it["quantity"]+aid_cost
                            and 0<=cents(it,"discount_allocated_brl")<=product_gross+total_add
                            and cents(it,"net_brl")==product_gross+total_add-cents(it,"discount_allocated_brl"))
    for name,value in (("antes_cadastro",before_reg),("antes_inauguracao",before_open),("fora_horario",out_of_hours),
                       ("fora_periodo_ou_status",wrong_status),("regras_adicionais",viol),("reconciliacao_financeira",financial),
                       ("venda_durante_ruptura",stockout),("compras_cliente_dia_duplicadas",dup_days)):
        check(name,value,0)
    result = {r["assignment_id"]:r for r in extra["campaign_results"]}
    events = group(extra["campaign_events"],"assignment_id")
    tx_lookup = {r["transaction_id"]:r for r in txs}
    campaigns_bad=0
    for a in extra["experiment_assignments"]:
        r=result[a["assignment_id"]]
        present = {e["event_type"] for e in events[a["assignment_id"]]}
        valid = (not(a["interaction_simulated"] and not a["delivery_simulated"])
                 and (a["send_simulated"]==(a["arm"]=="tratamento"))
                 and (a["send_simulated"]==("envio_simulado" in present))
                 and (a["delivery_simulated"]==("entrega_simulada" in present)) and
                 (a["interaction_simulated"]==("interação_simulada" in present)) and
                 (not a["delivery_simulated"] or a["send_simulated"]) and
                 age_on(customer[a["customer_id"]]["birth_date"],a["assigned_date"])>=18)
        for tx_key in (r["conversion_id"],r["attributed_transaction_id"]):
            if tx_key:
                t=tx_lookup[tx_key]
                valid = valid and t["customer_id"]==a["customer_id"] and a["assigned_date"]<t["sale_datetime"].date()<=a["observation_end"]
        if r["attributed_transaction_id"]:
            valid=valid and a["delivery_simulated"] and tx_lookup[r["attributed_transaction_id"]]["campaign_id"]==a["campaign_id"]
        campaigns_bad+=not valid
    check("cronologia_e_funil_de_campanha",campaigns_bad,0)
    ledgers=group(extra["loyalty_events"],"loyalty_account_id")
    point_bad=0
    for a in extra["loyalty_accounts"]:
        balance=0
        for e in ledgers[a["loyalty_account_id"]]:
            balance+=e["points_delta"]
            point_bad += balance<0 or balance!=e["balance_after"]
        point_bad += balance!=a["points_balance"] or balance!=a["points_earned"]-a["points_redeemed"]-a["points_expired"]
    check("ledger_de_fidelidade",point_bad,0)
    leak=0
    for s in extra["customer_rfm_snapshots"]:
        past=[t for t in tx_by[s["customer_id"]] if t["sale_datetime"].date()<=s["snapshot_date"]]
        leak+=not (past and len(past)==s["frequency"] and money(past,"net_brl")==s["monetary_brl"] and
                   (s["snapshot_date"]-past[-1]["sale_datetime"].date()).days==s["recency_days"])
    check("snapshots_sem_compras_futuras",leak,0)
    label_bad=sum((r["is_censored"] and r["purchased_30d"] is not None) or
                  (r["days_to_next_purchase"] is not None and not 0<r["days_to_next_purchase"]<=r["observed_days"]) or
                  (r["is_censored"]!=(r["observed_days"]<r["horizon_days"])) for r in labels)
    check("labels_temporais_e_censura",label_bad,0)
    w_add={t["transaction_id"] for t in txs if t["addons_subtotal_brl"]>0}
    report=summarize_orders(txs,w_add)
    actual_ticket=sum(cents(t,"net_brl") for t in txs)/len(txs)
    target_ticket,tolerance=conf["target_ticket_cents"],conf["ticket_tolerance"]
    lower,upper=round(target_ticket*(1-tolerance)),round(target_ticket*(1+tolerance))
    check("ticket_medio_cents",round(actual_ticket,4),[lower,upper],lower<=actual_ticket<=upper)
    check("receita_liquida_brl",report["net_brl"],[lower*len(txs)/100,upper*len(txs)/100],lower<=actual_ticket<=upper)
    observed=sum(r["status"]=="observado" for r in scenarios)
    if profile=="demo" and expected[0]>=10000:
        store_stats=extra["store_metrics"]
        ticket_gap=max(r["ticket_brl"] for r in store_stats)-min(r["ticket_brl"] for r in store_stats)
        retained=[r["retention_60d"] for r in store_stats if r["retention_60d"] is not None]
        ret_gap=max(retained)-min(retained)
        v=conf["validation"]
        check("cenarios_observados",observed,v["minimum_demo_scenarios"],observed>=v["minimum_demo_scenarios"])
        check("amplitude_ticket_loja_cents",round(ticket_gap*100),v["minimum_store_ticket_gap_cents"],ticket_gap*100>=v["minimum_store_ticket_gap_cents"])
        check("amplitude_retencao_loja",round(ret_gap,6),v["minimum_store_retention_gap"],ret_gap>=v["minimum_store_retention_gap"])
        complete=[r["growth_last_vs_first_3_full_months"] for r in store_stats if r["full_months"]==12]
        check("lojas_comparaveis_em_queda",sum(x<=-.05 for x in complete),v["minimum_declining_comparable_stores"],
              sum(x<=-.05 for x in complete)>=v["minimum_declining_comparable_stores"])
        check("lojas_comparaveis_em_alta",sum(x>=.12 for x in complete),v["minimum_growing_comparable_stores"],
              sum(x>=.12 for x in complete)>=v["minimum_growing_comparable_stores"])
    check("ticket_nao_degenerado",round(pstdev(t["net_brl"] for t in txs),2),"> 8",pstdev(t["net_brl"] for t in txs)>8)
    check("frequencia_cauda_longa",max(freqs),"> mediana × 5",max(freqs)>median(freqs)*5)
    check("diversidade_cestas",len({tuple(sorted({i["sku"] for i in vv})) for vv in by_tx.values()}),"> 50",
          len({tuple(sorted({i["sku"] for i in vv})) for vv in by_tx.values()})>50)
    ms=extra["customer_metrics"]
    report.update(frequency_median=median(freqs),frequency_p90=percentile(freqs,.90),frequency_max=max(freqs),
                  ticket_p10_brl=percentile([r["net_brl"] for r in txs],.10),ticket_p50_brl=percentile([r["net_brl"] for r in txs],.50),
                  ticket_p90_brl=percentile([r["net_brl"] for r in txs],.90),multistore=mult[2]+mult[3],
                  recurring=sum(m["frequency"]>=2 for m in ms),vip=sum(m["is_vip"] for m in ms),
                  at_risk=sum(m["is_risk"] for m in ms),inactive=sum(m["is_inactive"] for m in ms),
                  reactivated=sum(m["reactivation_count"]>0 for m in ms),observed_scenarios=observed,
                  total_scenarios=len(scenarios),outbound_messages=0,rf_segments=dict(Counter(m["rf_segment"] for m in ms)))
    return report, checks
