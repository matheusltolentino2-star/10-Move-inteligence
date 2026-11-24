"""Independent tests of observable results with explicit thresholds and comparison groups."""

from collections import Counter
from statistics import mean, median

from .analytics import divide, favorite, percentile
from .model import group


def evaluate_scenarios(conf, main, extra):
    txs, items, adds = [main[k] for k in ("transactions","transaction_items","transaction_addons")]
    tx_by = group(txs,"customer_id")
    it_by = group(items,"transaction_id")
    ad_by = group(adds,"item_id")
    store_by = group(txs,"store_id")
    stk = {p["sku"]:p for p in main["product_variants"]}
    tx_lookup = {t["transaction_id"]:t for t in txs}
    customer_metrics = extra["customer_metrics"]
    m_by = {r["customer_id"]:r for r in customer_metrics}
    stores = extra["store_metrics"]
    products = extra["product_metrics"]
    campaigns = extra["campaign_metrics"]
    pairs = extra["basket_affinity"]
    cohort = [r for r in extra["cohort_metrics"] if r["cohort_dimension"]=="acquisition_month" and
              r["horizon_days"]==60 and r["retention"] is not None]
    manifest,evaluation = [],[]
    n = len(customer_metrics)
    support = max(2,round(n*0.001))
    cutoff = customer_metrics[0]["snapshot_date"]
    midpoint = cutoff.replace(month=5,day=1)
    if not main["calendar"][0]["date"] < midpoint < cutoff:
        midpoint = main["calendar"][len(main["calendar"])//2]["date"]

    def scenario(name,source,criterion,value,threshold,positive,negative,unit="contagem",
                 mechanism="variação comercial e trajetórias",period=None):
        key = f'SC-{len(manifest)+1:02d}'
        is_observed = value is not None and value >= threshold
        manifest.append(dict(scenario_id=key,name=name,mechanism=mechanism,source_tables=source,
                             period=period or [main["calendar"][0]["date"],cutoff],
                             configured_intensity=conf["scenario_intensity"],metric_unit=unit,
                             detection_rule=criterion,expected_min=threshold,tolerance=0,
                             positive_entities=list(positive) if is_observed else [],
                             candidate_count=len(positive),negative_entity_examples=list(negative)[:10],
                             comparison_group="Positivos completos. Exemplos negativos avaliados com a mesma regra.",
                             platform_detected=None))
        evaluation.append(dict(scenario_id=key,name=name,metric_value=value,threshold=threshold,
                               status="observado" if is_observed else "não observado",
                               positive_count=len(positive) if is_observed else 0,platform_detected=None))

    def clients(name,predicate,rule,minimum=None,mechanism="perfil persistente e evolução longitudinal"):
        yes,no=[],[]
        for row in customer_metrics:
            (yes if predicate(row) else no).append(row["customer_id"])
        scenario(name,["customer_metrics","transactions"],rule,len(yes),support if minimum is None else minimum,yes,no,
                 mechanism=mechanism)

    def halves(row):
        orders=tx_by[row["customer_id"]]
        return ([t for t in orders if t["sale_datetime"].date()<midpoint],
                [t for t in orders if t["sale_datetime"].date()>=midpoint])

    def change_metric(row,key,ratio):
        early,late=halves(row)
        if min(len(early),len(late))<2:
            return False
        a,b=divided(early,key),divided(late,key)
        return b>=a*ratio if ratio>1 else b<=a*ratio

    def divided(orders,key):
        return mean(t[key] for t in orders)

    def by_half_favorite(row,key):
        early,late=halves(row)
        if min(len(early),len(late))<2:
            return False
        return favorite([key(t) for t in early])!=favorite([key(t) for t in late])

    def customer_categories(rows):
        return [stk[i["sku"]]["category"] for t in rows for i in it_by[t["transaction_id"]]]

    clients("VIPs em risco",lambda r:r["is_vip"] and (r["is_risk"] or r["is_inactive"]),
            "VIP histórico com risco pelo intervalo habitual ou ≥95 dias de recência.",2)
    clients("Fiéis reduzem frequência",lambda r:r["frequency"]>=8 and len(halves(r)[0])>=6 and len(halves(r)[1])<=len(halves(r)[0])*0.5,
            "≥8 pedidos, seis no primeiro semestre e segundo semestre com até metade do primeiro.")
    clients("Clientes de compra única",lambda r:r["frequency"]==1,"Clientes com frequência igual a 1",round(n*0.27))
    clients("Público para segunda compra",lambda r:r["frequency"]==1 and r["recency_days"]<=30,
            "Elegibilidade comercial: frequência 1 e recência ≤30 dias; sem score preditivo.")
    clients("Público de reativação",lambda r:r["is_inactive"] and r["frequency"]>=2,
            "Frequência ≥2 e recência ≥95 dias; oportunidade operacional.")
    clients("Reativados sem recompra subsequente",lambda r:r["last_reactivation_date"] and
            (cutoff-r["last_reactivation_date"]).days>=45 and
            not any(0<(t["sale_datetime"].date()-r["last_reactivation_date"]).days<=45 for t in tx_by[r["customer_id"]]),
            "Retorno após hiato ≥60 dias, seguimento ≥45 e zero novos pedidos em 45 dias.")
    clients("Recorrentes elevam ticket",lambda r:change_metric(r,"net_brl",1.25),"Dois ou mais pedidos por semestre e aumento de ticket ≥25%.")
    clients("Recorrentes reduzem ticket",lambda r:change_metric(r,"net_brl",.75),"Dois ou mais pedidos por semestre e redução ≥25%.")
    clients("Público para upselling",lambda r:r["frequency"]>=3 and r["preferred_size"]=="360 ml",
            "Frequência ≥3 e moda de tamanho 360 ml.")
    clients("Público para cross-selling de snacks",lambda r:r["frequency"]>=3 and r["preferred_category"] in conf["core_categories"] and
            "Snacks" not in customer_categories(tx_by[r["customer_id"]]),"Frequência ≥3, categoria favorita bebida principal e zero snacks.")
    adults = {r["customer_id"] for r in main["customers"] if r["age"]>=18 and r["communication_consent"]}
    clients("Público adulto para cross-selling de suplementos",lambda r:r["customer_id"] in adults and r["frequency"]>=3 and
            r["preferred_category"]==conf["core_categories"][1] and
            not any(stk[a["sku"]]["subcategory"]==conf["addon_rules"]["supplement_group"]
                    for t in tx_by[r["customer_id"]] for i in it_by[t["transaction_id"]] for a in ad_by[i["item_id"]]),
            "Adulto com consentimento simulado, ≥3 compras, preferência proteica e zero suplementos.")
    affinity = [r for r in pairs if r["support"]>=.005 and r["lift"]>=1.16]
    pair_id = lambda r:f'{r["product_a"]} + {r["product_b"]}'
    scenario("Afinidade de produtos",["basket_affinity"],"Pares com lift ≥1,16 e suporte ≥0,5%.",
             len(affinity),1,[pair_id(r) for r in affinity],[pair_id(r) for r in pairs if r["lift"]<1],mechanism="pesos de complementos na cesta")
    volume=percentile([r["units"] for r in products],.50)
    margin=percentile([r["gross_margin"] for r in products],.50)
    for name,pred in (
        ("Alto volume e menor margem",lambda r:r["units"]>volume and r["gross_margin"]<margin),
        ("Baixo volume e maior margem",lambda r:r["units"]<volume and r["gross_margin"]>margin),
    ):
        yes=[r["sku"] for r in products if pred(r)]
        scenario(name,["product_metrics"],"Cruzamento de volume e margem frente às medianas dos SKUs.",len(yes),2,
                 yes,[r["sku"] for r in products if not pred(r)],mechanism="preço de tabela, custos sintéticos e mix")

    rev_cut=median(r["net_brl"] for r in stores)
    ret_cut=median((r["retention_60d"] or 0) for r in stores)
    addon_cut=median(r["addons_order_share"] for r in stores)
    discount_cut=median(r["discount_share"] for r in stores)
    vip_cut=median(r["vip_revenue_share"] for r in stores)
    store_months=group(extra["store_monthly_metrics"],"store_id")
    store_rules=[
        ("Receita elevada e retenção baixa",lambda r:r["net_brl"]>rev_cut and (r["retention_60d"] or 0)<ret_cut,"Receita acima e recompra em 60 dias abaixo da mediana."),
        ("Receita menor e retenção elevada",lambda r:r["net_brl"]<rev_cut and (r["retention_60d"] or 0)>ret_cut,"Receita abaixo e recompra em 60 dias acima da mediana."),
        ("Lojas em crescimento",lambda r:(r["growth_last_vs_first_3_full_months"] or 0)>=.12,"Receita dos três últimos meses completos ≥12% acima dos três primeiros."),
        ("Lojas com queda de frequência",lambda r:mean(m["frequency_mean"] for m in store_months[r["store_id"]][-3:]) <
         .95*mean(m["frequency_mean"] for m in store_months[r["store_id"]][:3]),"Frequência intra-mês média dos últimos três meses ≥5% menor que a dos três primeiros."),
        ("Dependência de clientes VIP",lambda r:r["vip_revenue_share"]>=vip_cut*1.12,"Participação de VIPs na receita ≥112% da mediana de lojas."),
        ("Pressão de descontos",lambda r:r["discount_share"]>=discount_cut*1.35,"Descontos sobre receita bruta ≥135% da mediana de lojas."),
        ("Oportunidade de adicionais por loja",lambda r:r["addons_order_share"]<=addon_cut*.85,"Penetração de adicionais ≤85% da mediana da rede.")
    ]
    for name,predicate,rule in store_rules:
        yes=[r["store_id"] for r in stores if predicate(r)]
        scenario(name,["store_metrics","store_monthly_metrics"],rule,len(yes),1,yes,
                 [r["store_id"] for r in stores if not predicate(r)],mechanism="perfis comerciais e capacidade da unidade")
    clients("Migração entre lojas",lambda r:by_half_favorite(r,lambda t:t["store_id"]),"Dois pedidos por semestre e mudança da unidade mais frequente.")
    clients("Migração entre canais",lambda r:by_half_favorite(r,lambda t:t["channel"]),"Dois pedidos por semestre e mudança do canal mais frequente.")
    baseline=divide(sum(r["retained_clients"] for r in cohort),sum(r["eligible_clients"] for r in cohort))
    for name,direction in (("Coortes acima da retenção média",1),("Coortes abaixo da retenção média",-1)):
        yes=[r["cohort_value"] for r in cohort if r["eligible_clients"]>=25 and direction*(r["retention"]-baseline)>=.035]
        scenario(name,["cohort_metrics"],"Diferença de ≥3,5 p.p. da média ponderada de recompra em 60 dias; n≥25.",len(yes),1,yes,
                 [r["cohort_value"] for r in cohort if r["cohort_value"] not in yes])
    for name,test,rule in (
        ("Conversão alta e margem incremental baixa",lambda r:r["treatment_conversion"]>=.24 and (r["estimated_incremental_contribution_brl"] or 0)<0,
         "Conversão do tratamento ≥24% e contribuição incremental estimada negativa."),
        ("Campanhas com resultado incremental positivo",lambda r:(r["uplift_pp"] or 0)>=.08 and (r["estimated_incremental_contribution_brl"] or 0)>0,
         "Uplift ≥8 p.p. e contribuição incremental positiva na janela."),
        ("Campanhas de baixa eficiência",lambda r:(r["uplift_pp"] or 0)<=.025 and (r["promo_roi"] or 0)<=0,
         "Uplift ≤2,5 p.p. e ROI promocional ≤0.")
    ):
        yes=[r["campaign_id"] for r in campaigns if min(r["n_treatment"],r["n_control"])>=20 and test(r)]
        scenario(name,["campaign_metrics"],rule+" Pelo menos 20 pessoas por braço.",len(yes),1,yes,
                 [r["campaign_id"] for r in campaigns if r["campaign_id"] not in yes],
                 mechanism="braços definidos antes da realização da janela, incentivos e custo de contato")
    coast=[s["store_id"] for s in main["stores"] if s["region"]=="Litoral"]
    months=[r for r in extra["store_monthly_metrics"] if r["store_id"] in coast]
    summer=sum(r["orders"] for r in months if int(r["month"][-2:]) in {12,1,2})
    winter=sum(r["orders"] for r in months if int(r["month"][-2:]) in {6,7,8})
    scenario("Sazonalidade no litoral",["store_monthly_metrics"],"Pedidos no verão sobre inverno ≥1,45.",
             round(divide(summer,winter),4),1.45,coast,[s["store_id"] for s in main["stores"] if s["store_id"] not in coast],
             "razão",mechanism="sensibilidade sazonal da loja e pesos climáticos")
    yes=[r["store_id"] for r in stores if r["stage"]=="recém-inaugurada" and (r["growth_last_vs_first_3_full_months"] or 0)>=.12]
    scenario("Maturação de loja nova",["stores","store_monthly_metrics"],
             "Loja inaugurada no período, com crescimento ≥12% em janelas de três meses completos.",len(yes),1,yes,
             [r["store_id"] for r in stores if r["store_id"] not in yes],mechanism="efeito de novidade e curva de maturação")
    stock_effect=[]
    for e in extra["operation_events"]:
        if e["event_type"]!="stockout":
            continue
        s=e["store_id"]
        begin,end=e["start_date"],e["end_date"]
        in_window=[i for t in store_by[s] if begin<=t["sale_datetime"].date()<=end for i in it_by[t["transaction_id"]]]
        category=next(p["category"] for p in stk.values() if p["name"]==e["product_family"])
        if in_window and not any(stk[i["sku"]]["name"]==e["product_family"] for i in in_window) and any(
                stk[i["sku"]]["category"]==category for i in in_window):
            stock_effect.append(e["event_id"])
    scenario("Substitutos durante ruptura",["operation_events","transactions","transaction_items"],
             "Nenhuma venda da família indisponível e presença de outras famílias da categoria no intervalo.",
             len(stock_effect),1,stock_effect,[e["event_id"] for e in extra["operation_events"] if e["event_type"]!="stockout"],
             mechanism="filtro de disponibilidade antes de compor cestas")
    clients("Mudança da categoria favorita",lambda r:by_half_favorite(r,lambda t:stk[it_by[t["transaction_id"]][0]["sku"]]["category"]),
            "Dois pedidos por semestre e mudança da moda da categoria do primeiro item.")
    clients("Alta recorrência e baixo ticket",lambda r:r["frequency"]>=10 and r["ticket_brl"]<=34,"Frequência ≥10 e ticket ≤R$ 34.")
    clients("Baixa recorrência e ticket alto",lambda r:r["frequency"]<=2 and r["ticket_brl"]>=65,"Frequência ≤2 e ticket ≥R$ 65.")
    segment_group=group(customer_metrics,"rf_segment")
    segment_channel=[]
    for label,rows in segment_group.items():
        if len(rows)<max(15,support):
            continue
        categories=[r["preferred_category"] for r in rows]
        best=favorite(categories)
        base=divide(sum(r["preferred_category"]==best for r in customer_metrics),n)
        p=divide(categories.count(best),len(categories))
        if p>=base+.022:
            segment_channel.append(f'{label}: {best}')
    scenario("Aceitação de categoria por segmento RF",["customer_metrics"],
             "Preferência de categoria ≥2,2 p.p. acima da base e segmento com tamanho mínimo.",
             len(segment_channel),1,segment_channel,[str(s) for s in segment_group if not any(x.startswith(str(s)+":") for x in segment_channel)])
    restrictions=[]
    for e in extra["operation_events"]:
        if e["event_type"] not in {"closed","reduced_hours"}:
            continue
        s,b,z=e["store_id"],e["start_date"],e["end_date"]
        window=(z-b).days+1
        after=sum(b<=t["sale_datetime"].date()<=z for t in store_by[s])
        before=sum(0<(b-t["sale_datetime"].date()).days<=window for t in store_by[s])
        if before and after/before<=.75:
            restrictions.append(e["event_id"])
    scenario("Efeito de interrupção operacional",["operation_events","transactions"],
             "Volume durante intervenção ≤75% do volume em janela adjacente de mesmo tamanho.",len(restrictions),1,
             restrictions,[e["event_id"] for e in extra["operation_events"] if e["event_type"]=="reopening"])
    chan=sorted(extra["channel_metrics"],key=lambda r:r["contribution_margin"])
    gap=chan[-1]["contribution_margin"]-chan[0]["contribution_margin"] if len(chan)>1 else None
    scenario("Margem varia por canal",["channel_metrics"],"Distância entre margens de contribuição ≥10 p.p.",gap,.10,
             [r["channel"] for r in chan[::max(1,len(chan)-1)]],[r["channel"] for r in chan[1:-1]],"proporção",
             mechanism="comissão, taxa e subsídio por canal")
    def gaps(r):
        days=[t["sale_datetime"].date() for t in tx_by[r["customer_id"]]]
        return [(b-a).days for a,b in zip(days,days[1:])]
    clients("Padrões de visita previsíveis",lambda r:r["frequency"]>=6 and
            max(Counter(t["sale_datetime"].weekday() for t in tx_by[r["customer_id"]]).values())>=.60*r["frequency"],
            "≥6 compras e pelo menos 60% no mesmo dia da semana.")
    clients("Padrões de visita irregulares",lambda r:r["frequency"]>=6 and max(gaps(r))>=4*median(gaps(r)),
            "≥6 compras e intervalo máximo ≥4 vezes o intervalo mediano.")
    ranked=sorted(customer_metrics,key=lambda r:r["monetary_brl"],reverse=True)
    top=ranked[:max(1,n//10)]
    share=divide(sum(r["monetary_brl"] for r in top),sum(r["monetary_brl"] for r in ranked))
    scenario("Concentração financeira",["customer_metrics"],"Top 10% concentra pelo menos 32% da receita.",
             round(share,6),.32,[r["customer_id"] for r in top],[r["customer_id"] for r in ranked[-10:]],"proporção",
             mechanism="distribuição de frequência com cauda longa e cestas distintas")
    return manifest,evaluation


def classifier_scores(expected, ranked_predictions, k=None):
    """Use with model outputs keyed by IDs, independently of the simulator."""
    expected = set(expected)
    predictions = list(dict.fromkeys(ranked_predictions))[:k]
    tp = len(expected.intersection(predictions))
    fp,fn = len(predictions)-tp,len(expected)-tp
    precision,recall = divide(tp,tp+fp),divide(tp,tp+fn)
    return dict(tp=tp,fp=fp,fn=fn,precision=precision,recall=recall,f1=divide(2*precision*recall,precision+recall))
