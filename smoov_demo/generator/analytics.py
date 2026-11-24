"""Observed commercial metrics and forward labels on time-separated datasets."""

from collections import Counter, defaultdict
from datetime import timedelta
from itertools import combinations
from statistics import mean, median

from .model import DAY, WEEKDAYS, group, month_date


def divide(a,b):
    return a/b if b else 0


def percentile(values,p):
    values = sorted(values)
    return values[min(len(values)-1,int(len(values)*p))] if values else None


def favorite(values):
    return Counter(values).most_common(1)[0][0] if values else None


def money(rows,k):
    return round(sum(round(r[k]*100) for r in rows)/100, 2)


def rfm(recency, frequency, cuts):
    r33,r66,f33,f66 = cuts
    r = 3 if recency <= r33 else 2 if recency <= r66 else 1
    f = 3 if frequency >= f66 else 2 if frequency >= f33 else 1
    if r == 3:
        segment = "Campeões" if f == 3 else "Promissores"
    elif r == 1:
        segment = "Em risco" if f >= 2 else "Hibernando"
    else:
        segment = "Fiéis" if f == 3 else "Ocasionais"
    return r,f,segment


def observed_state(count,recency,vip,reactivated,gaps,settings):
    if recency >= settings["lost_days"]:
        return "perdido operacional"
    if recency >= settings["inactive_days"]:
        return "inativo"
    if count >= 3 and recency >= max(37,1.65*median(gaps)):
        return "em risco"
    if reactivated and recency < 35:
        return "reativado recente"
    if vip:
        return "VIP"
    if count >= 5:
        return "fiel"
    if count >= 3:
        return "recorrente"
    return "segunda compra" if count == 2 else "primeira compra"


def customer_analytics(conf,customers,txs,item_rows,addon_rows,catalog,start,end):
    tx_by = group(txs,"customer_id")
    items = group(item_rows,"transaction_id")
    addons = group(addon_rows,"item_id")
    sku = {p["sku"]:p for p in catalog}
    rfm_rows,labels,metrics,movements,cohorts = [],[],[],[],[]
    prior = {}
    b = conf["behavior"]
    for month in range(12):
        cut = month_date(start,month+1)-DAY
        active = {key:[t for t in rows if t["sale_datetime"].date() <= cut] for key,rows in tx_by.items()}
        active = {k:v for k,v in active.items() if v}
        recencies = [(cut-v[-1]["sale_datetime"].date()).days for v in active.values()]
        frequencies = [len(v) for v in active.values()]
        amounts = {k:money(v,"net_brl") for k,v in active.items()}
        monetary_cut = percentile(amounts.values(),b["vip_percentile"])
        cuts = (percentile(recencies,.33),percentile(recencies,.66),percentile(frequencies,.33),percentile(frequencies,.66))
        for key,orders in active.items():
            stamps = [t["sale_datetime"].date() for t in orders]
            first,last = stamps[0],stamps[-1]
            recency, count = (cut-last).days,len(orders)
            gaps = [(y-x).days for x,y in zip(stamps,stamps[1:])]
            vip = count>=b["vip_min_purchases"] and amounts[key]>=monetary_cut
            reactivation_dates = [d for d,g in zip(stamps[1:],gaps) if g>=b["reactivation_gap_days"]]
            reactivated = bool(reactivation_dates and (cut-reactivation_dates[-1]).days < 35)
            state = observed_state(count,recency,vip,reactivated,gaps,b)
            r,f,segment = rfm(recency,count,cuts) if len(active)>=50 else (None,None,None)
            snapshot = dict(customer_id=key,snapshot_date=cut,recency_days=recency,frequency=count,
                            monetary_brl=amounts[key],recency_score=r,frequency_score=f,rf_score=(r+f if r else None),
                            rf_segment=segment,observed_state=state,is_vip=vip,
                            is_risk=count>=3 and recency>=max(37,1.65*median(gaps)) and recency<b["inactive_days"])
            rfm_rows.append(snapshot)
            prev = prior.get(key)
            if prev != (state,segment):
                movements.append(dict(customer_id=key,snapshot_date=cut,prior_state=prev[0] if prev else None,
                                      current_state=state,prior_segment=prev[1] if prev else None,current_segment=segment))
                prior[key] = (state,segment)
            if month in {2,5,7,8,9,10,11}:
                window = 30
                limit = min(end,cut+timedelta(days=window))
                future = [t for t in tx_by[key] if cut<t["sale_datetime"].date()<=limit]
                censored = (end-cut).days<window
                future_items = [i for t in future for i in items[t["transaction_id"]]]
                labels.append(dict(customer_id=key,cutoff_date=cut,split="treino" if month<=5 else "validação" if month<=8 else "teste",
                                   horizon_days=window,observed_days=(limit-cut).days,is_censored=censored,
                                   purchased_30d=bool(future) if not censored else None,
                                   next_purchase_observed=bool(future),
                                   days_to_next_purchase=(future[0]["sale_datetime"].date()-cut).days if future else None,
                                   no_repurchase_churn_proxy_30d=not future if not censored else None,
                                   future_net_30d_brl=money(future,"net_brl") if not censored else None,
                                   future_large_item_30d=any(sku[i["sku"]]["size"]=="480 ml" for i in future_items) if not censored else None,
                                   future_snack_30d=any(sku[i["sku"]]["category"]=="Snacks" for i in future_items) if not censored else None,
                                   future_supplement_30d=any(sku[a["sku"]]["subcategory"]==conf["addon_rules"]["supplement_group"]
                                                            for i in future_items for a in addons[i["item_id"]]) if not censored else None,
                                   future_reactivated_30d=bool(future and (future[0]["sale_datetime"].date()-last).days>=b["reactivation_gap_days"]
                                                               and recency>=b["reactivation_gap_days"]) if not censored else None,
                                   next_primary_sku=items[future[0]["transaction_id"]][0]["sku"] if future else None))
            if month != 11:
                continue
            store_counts = Counter(t["store_id"] for t in orders)
            store_spend = {s:money([t for t in orders if t["store_id"]==s],"net_brl") for s in store_counts}
            customer_items = [i for t in orders for i in items[t["transaction_id"]]]
            customer_addons = [a for i in customer_items for a in addons[i["item_id"]]]
            first_product = sku[items[orders[0]["transaction_id"]][0]["sku"]]
            metric_customer=dict(snapshot)
            metric_customer.update(first_purchase_date=first,last_purchase_date=last,days_since_first=(cut-first).days,
                                       interval_mean_days=round(mean(gaps),2) if gaps else None,
                                       historical_ltv_brl=amounts[key],ticket_brl=round(amounts[key]/count,2),
                                       contribution_brl=money(orders,"contribution_brl"),
                                       first_store_id=orders[0]["store_id"],last_store_id=orders[-1]["store_id"],
                                       preferred_store_id=store_counts.most_common(1)[0][0],
                                       highest_spend_store_id=max(store_spend,key=store_spend.get),distinct_stores=len(store_counts),
                                       preferred_product=favorite([sku[i["sku"]]["name"] for i in customer_items]),
                                       preferred_category=favorite([sku[i["sku"]]["category"] for i in customer_items]),
                                       preferred_size=favorite([sku[i["sku"]]["size"] for i in customer_items if sku[i["sku"]]["size"].endswith(" ml")]),
                                       favorite_addon=favorite([sku[a["sku"]]["name"] for a in customer_addons]),
                                       preferred_hour=favorite([t["sale_datetime"].hour for t in orders]),
                                       preferred_weekday=favorite([WEEKDAYS[t["sale_datetime"].weekday()] for t in orders]),
                                       preferred_channel=favorite([t["channel"] for t in orders]),
                                       sku_diversity=len({i["sku"] for i in customer_items}),
                                       promo_order_share=divide(sum(t["discount_brl"]>0 for t in orders),count),
                                       reactivation_count=len(reactivation_dates),last_reactivation_date=reactivation_dates[-1] if reactivation_dates else None,
                                       is_active=recency<b["inactive_days"],is_inactive=recency>=b["inactive_days"])
            metrics.append(metric_customer)
            cohorts.append(dict(customer_id=key,acquisition_month=first.strftime("%Y-%m"),acquisition_store_id=orders[0]["store_id"],
                                first_product_sku=first_product["sku"],first_category=first_product["category"],
                                first_channel=orders[0]["channel"],first_ticket_band="até 30" if orders[0]["net_brl"]<=30 else "30 a 50" if orders[0]["net_brl"]<=50 else "acima de 50",
                                first_campaign_id=next((t["campaign_id"] for t in orders if t["campaign_id"]),None),
                                first_order_discount=orders[0]["discount_brl"]>0,first_purchase_date=first,
                                second_purchase_date=stamps[1] if count>1 else None))
    for customer,metric in zip(customers,metrics):
        if customer["customer_id"]!=metric["customer_id"]:
            raise ValueError("Métricas de cliente fora de ordem.")
        customer.update(first_store_id=metric["first_store_id"],preferred_store_id=metric["preferred_store_id"])
    return metrics,rfm_rows,cohorts,movements,labels


def summarize_orders(rows,with_addons):
    net = money(rows,"net_brl")
    gross = money(rows,"gross_brl")
    cmv = money(rows,"cmv_brl")
    contribution = money(rows,"contribution_brl")
    buyers = Counter(t["customer_id"] for t in rows)
    return dict(customers=len(buyers),orders=len(rows),gross_brl=gross,net_brl=net,cmv_brl=cmv,ticket_brl=round(divide(net,len(rows)),2),
                gross_margin=round(divide(net-cmv,net),6),contribution_brl=contribution,contribution_margin=round(divide(contribution,net),6),
                frequency_mean=round(divide(len(rows),len(buyers)),4),
                discount_share=round(divide(money(rows,"discount_brl"),gross),6),
                addons_order_share=round(divide(sum(t["transaction_id"] in with_addons for t in rows),len(rows)),6))


def cohort_stats(cohorts,tx_by,end):
    out = []
    groups = defaultdict(list)
    for row in cohorts:
        for dimension in ("acquisition_month","acquisition_store_id","first_product_sku","first_category","first_channel",
                          "first_ticket_band","first_campaign_id","first_order_discount"):
            groups[dimension,str(row[dimension])].append(row)
    for (dimension,label),people in groups.items():
        for window in (7,15,30,60,90):
            eligible = [p for p in people if (end-p["first_purchase_date"]).days>=window]
            retained = sum(p["second_purchase_date"] is not None and
                           (p["second_purchase_date"]-p["first_purchase_date"]).days<=window for p in eligible)
            txs = [t for p in eligible for t in tx_by[p["customer_id"]]
                   if (t["sale_datetime"].date()-p["first_purchase_date"]).days<=window]
            net = money(txs,"net_brl")
            out.append(dict(cohort_dimension=dimension,cohort_value=label,horizon_days=window,cohort_size=len(people),
                            eligible_clients=len(eligible),censored_clients=len(people)-len(eligible),retained_clients=retained,
                            retention=round(retained/len(eligible),6) if eligible else None,net_brl=net,orders=len(txs),
                            frequency=round(divide(len(txs),len(eligible)),4),ticket_brl=round(divide(net,len(txs)),2)))
    return out


def analytical_tables(conf,catalog,stores,customers,commerce,campaigns,results,start,end):
    txs,items,addons = (commerce[k] for k in ("transactions","transaction_items","transaction_addons"))
    metrics,snapshots,cohorts,movements,labels=customer_analytics(conf,customers,txs,items,addons,catalog,start,end)
    tx_by = group(txs,"customer_id")
    cohort_kpis = cohort_stats(cohorts,tx_by,end)
    tx_by_store = group(txs,"store_id")
    with_addons = {t["transaction_id"] for t in txs if t["addons_subtotal_brl"]>0}
    daily, monthly,store_metrics = [],[],[]
    for key,s in stores.items():
        rows = tx_by_store[key]
        dgrp,mgrp = defaultdict(list),defaultdict(list)
        for t in rows:
            d = t["sale_datetime"].date()
            dgrp[d].append(t)
            mgrp[d.strftime("%Y-%m")].append(t)
        for d in sorted(dgrp):
            daily.append(dict(store_id=key,date=d,**summarize_orders(dgrp[d],with_addons)))
        for m in range(12):
            d = month_date(start,m)
            label=d.strftime("%Y-%m")
            prev=month_date(start,m-1).strftime("%Y-%m")
            a,b=len(mgrp[label]),len(mgrp[prev])
            monthly.append(dict(store_id=key,month=label,full_month_open=s["opening_date"]<=d,
                                mom_order_growth=round((a-b)/b,6) if m and b and s["opening_date"]<=month_date(start,m-1) else None,
                                **summarize_orders(mgrp[label],with_addons)))
        metrics_store = summarize_orders(rows,with_addons)
        cohort = [r for r in cohort_kpis if r["cohort_dimension"]=="acquisition_store_id" and
                  r["cohort_value"]==key and r["horizon_days"]==60][0]
        full_months=[r for r in monthly if r["store_id"]==key and r["full_month_open"]]
        early,late=full_months[:3],full_months[-3:]
        growth = divide(sum(r["net_brl"] for r in late),sum(r["net_brl"] for r in early))-1 if len(full_months)>=6 else None
        vip_ids = {r["customer_id"] for r in metrics if r["is_vip"]}
        metrics_store.update(store_id=key,store_name=s["store_name"],stage=s["stage"],
                             retention_60d=cohort["retention"],retention_eligible=cohort["eligible_clients"],
                             growth_last_vs_first_3_full_months=round(growth,6) if growth is not None else None,
                             full_months=len(full_months),network_net_share=round(divide(metrics_store["net_brl"],money(txs,"net_brl")),6),
                             vip_revenue_share=round(divide(money([r for r in rows if r["customer_id"] in vip_ids],"net_brl"),metrics_store["net_brl"]),6))
        store_metrics.append(metrics_store)
    comparable_sales=[]
    store_and_month={(r["store_id"],r["month"]):r for r in monthly}
    for m in range(1,12):
        previous,current=(month_date(start,i).strftime("%Y-%m") for i in (m-1,m))
        comparable=[k for k in stores if all(store_and_month[k,label]["full_month_open"] for label in (previous,current))]
        p,c=(money([store_and_month[k,label] for k in comparable],"net_brl") for label in (previous,current))
        comparable_sales.append(dict(month=current,previous_month=previous,comparable_stores=len(comparable),
                                     prior_net_brl=p,current_net_brl=c,net_growth=round(c/p-1,6) if p else None))
    channels = [dict(channel=k,**summarize_orders(v,with_addons)) for k,v in group(txs,"channel").items()]
    sku = {p["sku"]:p for p in catalog}
    skus = []
    for k,rows in group(items,"sku").items():
        net,cmv=money(rows,"net_brl"),money(rows,"cmv_brl")
        skus.append(dict(sku=k,product=sku[k]["name"],category=sku[k]["category"],units=sum(r["quantity"] for r in rows),
                         orders=len({r["transaction_id"] for r in rows}),net_brl=net,cmv_brl=cmv,gross_margin=round(divide(net-cmv,net),6)))
    pair_counts,total = Counter(),Counter()
    for order_rows in group(items,"transaction_id").values():
        names=sorted({sku[r["sku"]]["name"] for r in order_rows})
        total.update(names)
        pair_counts.update(combinations(names,2))
    pair_kpis=[]
    for (a,b),n in pair_counts.most_common():
        pair_kpis.append(dict(product_a=a,product_b=b,orders=n,support=round(n/len(txs),6),
                              confidence_a_b=round(n/total[a],6),confidence_b_a=round(n/total[b],6),
                              lift=round(n*len(txs)/(total[a]*total[b]),6)))
    campaign_kpis=[]
    for campaign_id,rows in group(results,"campaign_id").items():
        arms=group(rows,"arm")
        treatment,control,holdout = [arms[k] for k in ("tratamento","controle","holdout")]
        p=lambda rs: divide(sum(r["conversion_id"] is not None for r in rs),len(rs))
        per_capita = lambda rs,k: divide(sum(r[k] for r in rs),len(rs))
        rev_incr = (per_capita(treatment,"window_revenue_brl")-per_capita(control,"window_revenue_brl"))*len(treatment) if control else None
        cost = money(treatment,"cost_brl")
        margin_incr = ((per_capita(treatment,"window_contribution_brl")-per_capita(control,"window_contribution_brl"))*len(treatment)-cost
                       if control else None)
        kpi=dict(campaign_id=campaign_id,n_treatment=len(treatment),n_control=len(control),n_holdout=len(holdout),
                 treatment_conversion=round(p(treatment),6),control_conversion=round(p(control),6),holdout_conversion=round(p(holdout),6),
                 uplift_pp=round(p(treatment)-p(control),6) if control else None,
                 estimated_incremental_conversions=round((p(treatment)-p(control))*len(treatment),3) if control else None,
                 estimated_incremental_revenue_brl=round(rev_incr,2) if rev_incr is not None else None,
                 estimated_incremental_contribution_brl=round(margin_incr,2) if margin_incr is not None else None,
                 promo_roi=round(divide(margin_incr,cost),6) if margin_incr is not None and cost else None,
                 cost_per_treated_conversion_brl=round(cost/sum(r["conversion_id"] is not None for r in treatment),2)
                 if any(r["conversion_id"] for r in treatment) else None,
                 attributed_orders=sum(r["attributed_transaction_id"] is not None for r in treatment),
                 attributed_revenue_brl=money(treatment,"attributed_revenue_brl"),
                 attributed_contribution_brl=money(treatment,"attributed_contribution_brl"),send_cost_brl=cost)
        campaign_kpis.append(kpi)
    return dict(customer_metrics=metrics,customer_rfm_snapshots=snapshots,customer_cohorts=cohorts,cohort_metrics=cohort_kpis,
                lifecycle_movements=movements,store_daily_metrics=daily,store_monthly_metrics=monthly,store_metrics=store_metrics,
                same_store_sales=comparable_sales,
                product_metrics=skus,channel_metrics=channels,basket_affinity=pair_kpis,campaign_metrics=campaign_kpis),labels


def opportunities(metrics):
    # First matching opportunity owns a customer in this illustrative portfolio.
    policy = [
        ("recuperação VIP",lambda r:r["is_vip"] and r["is_risk"],(.04,.09,.15),0,0.70,5),
        ("reativação",lambda r:r["is_inactive"] and r["frequency"]>=2,(.025,.06,.11),0,0.65,4),
        ("segunda compra",lambda r:r["frequency"]==1 and r["recency_days"]<=30,(.045,.10,.17),0,0.68,3),
        ("upselling",lambda r:r["preferred_size"]=="360 ml" and r["frequency"]>=3,(.05,.13,.22),8,0.70,1.5),
        ("cross-selling",lambda r:r["frequency"]>=3 and not r["favorite_addon"],(.05,.14,.24),6,0.62,1.25),
        ("frequência",lambda r:r["is_active"] and r["frequency"]>=3,(.025,.06,.10),0,0.65,2),
        ("otimização de desconto",lambda r:r["promo_order_share"]>=.40,(.035,.08,.15),4,0.86,0.8),
        ("retenção",lambda r:r["is_risk"],(.035,.08,.15),0,0.65,2.5)
    ]
    claimed=set()
    rows=[]
    for label,test,rates,price,margin,cost in policy:
        eligible=[r for r in metrics if test(r)]
        unique=[r for r in eligible if r["customer_id"] not in claimed]
        claimed.update(r["customer_id"] for r in unique)
        value=price or (mean(r["ticket_brl"] for r in unique) if unique else 0)
        for case,rate in zip(("conservador","base","otimista"),rates):
            rev=len(unique)*rate*value
            rows.append(dict(opportunity=label,case=case,eligible_clients=len(eligible),unique_portfolio_clients=len(unique),
                             assumed_adoption=rate,incremental_units_per_adopter=1,assumed_incremental_ticket_brl=round(value,2),
                             assumed_margin=margin,cost_per_adopter_brl=cost,
                             potential_revenue_brl=round(rev,2),potential_contribution_brl=round(rev*margin-len(unique)*rate*cost,2)))
    return rows
