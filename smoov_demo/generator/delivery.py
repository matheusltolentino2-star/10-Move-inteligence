"""Projections, workbook export and machine-readable data dictionary."""

import csv
import gzip
import json
from datetime import date, datetime
from math import isclose
from pathlib import Path
from zipfile import ZipFile

import xlsxwriter
from openpyxl import load_workbook

from .model import group, rid
from .validation import KEYS, target

FILES = {
    "gold":"datasets/smoov_demo_database.xlsx", "import":"datasets/smoov_import.xlsx",
    "extended":"datasets/smoov_extended_data.xlsx", "raw":"datasets/smoov_raw_quality_tests.xlsx",
    "identity":"datasets/smoov_identity_resolution_tests.xlsx", "exceptions":"datasets/smoov_transaction_exceptions.xlsx",
    "dictionary":"reports/data_dictionary.xlsx",
}


def dimensions_for_export(conf,stores,stock,calendar,start,end):
    org = dict(organization_id=conf["organization_id"],organization_name=conf["organization_name"],brand=conf["brand"],
               timezone=conf["timezone"],currency=conf["currency"],locale=conf["locale"],is_synthetic=True,
               is_demo=True,outbound_messaging_enabled=False)
    store_export = [dict(store_id=k,organization_id=s["organization_id"],store_code=s["code"],store_name=s["store_name"],
                         city=s["city"],state=s["state"],region=s["region"],neighborhood=s["area"],opening_date=s["opening_date"],
                         operating_days_at_cutoff=(end-s["opening_date"]).days+1,stage=s["stage"],operation_model="franquia simulada",
                         weekday_open_hour=s["hours"][0],weekday_close_hour=s["hours"][1],
                         weekend_open_hour=s["hours"][0]+1,weekend_close_hour=s["hours"][1]-1,
                         relative_capacity=s["quota"]/max(ss["quota"] for ss in stores.values()),commercial_profile=s["profile"],
                         expected_orders=s["order_quota"],target_ticket_brl=round(conf["target_ticket_cents"]/100*(1+s["premium"]*.68),2),
                         fruit_mix_weight=s["mix"][0],protein_mix_weight=s["mix"][1],shake_mix_weight=s["mix"][2],
                         promotion_propensity=s["discount"],available_channels=" | ".join(r[0] for r in conf["channels"]),
                         operational_status="ativa",is_demo=True) for k,s in stores.items()]
    family_ids={}
    categories=[]
    for group_name,rows in group(stock,"category").items():
        categories.append(dict(category=group_name,variant_count=len(rows),is_addon=rows[0]["is_addon"]))
    for row in stock:
        if row["name"] not in family_ids:
            family_ids[row["name"]]=rid("PROD",len(family_ids)+1)
    products=[dict(product_id=family_ids[k],name=k,category=v[0]["category"],subcategory=v[0]["subcategory"],
                   ingredients=v[0]["ingredients"],description=v[0]["ingredients"],is_addon=v[0]["is_addon"],
                   launch_date=None,status="ativo",is_synthetic=v[0]["sku"].startswith("DEMO-"))
              for k,v in group(stock,"name").items()]
    variants,addons,costs,prices=[],[],[],[]
    for p in stock:
        size=p["size"]
        price=p["price_cents"]/100
        sku=p["sku"]
        v = dict(sku=sku,product_id=family_ids[p["name"]],name=p["name"],category=p["category"],subcategory=p["subcategory"],
                 size=size,volume_ml=int(size.split()[0]) if size.endswith(" ml") else None,
                 unit_of_measure="mL" if size.endswith(" ml") else "g" if size.endswith(" g") else size,
                 price_brl=price,protein_g=p["protein_g"],ingredients=p["ingredients"],
                 tags=" | ".join(p["tags"]) if isinstance(p["tags"],list) else p["tags"],
                 available=True,is_addon=p["is_addon"])
        variants.append(v)
        if p["is_addon"]:
            addons.append(dict(sku=sku,name=p["name"],addon_group=p["subcategory"],price_per_dose_brl=price,
                               age_floor=18 if p["subcategory"]==conf["addon_rules"]["supplement_group"] else None))
        costs.append(dict(sku=sku,unit_cost_brl=p["cost_cents"]/100,
                          ingredients_cost_brl=(p["cost_cents"]*84//100)/100,
                          packaging_cost_brl=(p["cost_cents"]-p["cost_cents"]*84//100)/100,
                          list_gross_margin=round(1-p["cost_cents"]/p["price_cents"],6),is_synthetic=True))
        prices.append(dict(sku=sku,effective_from=start,effective_through=end,listed_unit_price_brl=price,
                           currency=conf["currency"],price_origin="cardápio fornecido; constante durante a simulação"))
    rules=conf["addon_rules"]
    rlist=[]
    for v in variants:
        if v["category"] in conf["core_categories"] and conf["core_categories"].index(v["category"]) in rules["compatible_core_categories"]:
            for label,limit in (
                (rules["protein_group"],rules["protein_category_max"] if v["category"]==conf["core_categories"][1] else rules["volume_ml"][str(v["volume_ml"])]),
                (rules["supplement_group"],rules["supplements_max"]),
                (rules["superfood_group"],rules["superfoods_max"])):
                rlist.append(dict(rule_id=rid("RUL",len(rlist)+1),sku=v["sku"],addon_group=label,
                                  maximum_doses_per_unit=limit,minimum_age=18 if label==rules["supplement_group"] else None,
                                  fruits_or_base_can_change=False))
    channels=[dict(channel=label,configured_weight=weight,commission_bps=bps,delivery_subsidy_brl=cents/100)
              for label,weight,bps,cents in conf["channels"]]
    payment=[dict(payment_method=label,variable_fee_bps=bps,is_synthetic=True)
             for label,bps in conf["payment_methods"]]
    return dict(organizations=[org],stores=store_export,product_categories=categories,products=products,product_variants=variants,
                addons=addons,addon_rules=rlist,sales_channels=channels,payment_methods=payment,calendar=calendar,
                price_history=prices,product_costs=costs)


def import_tables(main, extra):
    tx = {r["transaction_id"]:r for r in main["transactions"]}
    variants = {r["sku"]:r for r in main["product_variants"]}
    stores = {r["store_id"]:r["store_name"] for r in main["stores"]}
    cm = {r["customer_id"]:r for r in extra["customer_metrics"]}
    customers = []
    for c in main["customers"]:
        m=cm[c["customer_id"]]
        customers.append(dict(cliente_id=c["customer_id"], idade=c["age"],nascimento=c["birth_date"],genero=c["gender"],
                              uf=c["state"],cidade=c["city"],bairro=c["neighborhood"],data_cadastro=c["registration_date"],
                              data_ultima_compra=m["last_purchase_date"],recencia_dias=m["recency_days"],
                              compras=m["frequency"],ticket=m["ticket_brl"],receita=m["monetary_brl"],
                              hora=m["preferred_hour"],dia_semana=m["preferred_weekday"],canal=c["acquisition_channel"],
                              plano=m["preferred_category"],status=m["observed_state"],unidade_preferida=stores[m["preferred_store_id"]],
                              is_synthetic=True,is_demo=True,outbound_messaging_enabled=False))
    items=[]
    for it in main["transaction_items"]:
        t=tx[it["transaction_id"]]
        p=variants[it["sku"]]
        stamp=t["sale_datetime"]
        items.append(dict(pedido_id=it["transaction_id"],cliente_id=t["customer_id"],sku=it["sku"],produto=p["name"],
                          tamanho=p["size"],categoria=p["category"],data_pedido=stamp.date(),hora=stamp.strftime("%H:%M:%S"),
                          quantidade=it["quantity"],valor_unitario=it["unit_price_brl"],valor_total=it["net_brl"],
                          canal=t["channel"],unidade=stores[t["store_id"]]))
    catalog=[dict(sku=p["sku"],produto=p["name"],categoria=p["category"],subcategoria=p["subcategory"],tamanho=p["size"],
                  preco=p["price_brl"],ingredientes=p["ingredients"],proteina_g=p["protein_g"],tags=p["tags"],disponivel=p["available"])
             for p in main["product_variants"]]
    # Cardápio lê a primeira aba. Clientes e transações usam a pontuação por modo.
    return dict(catalogo=catalog,clientes=customers,transacoes=items)


def json_string(value):
    return json.dumps(value,ensure_ascii=False,default=str,sort_keys=True,separators=(",",":"))


def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,default=str,indent=2)+"\n",encoding="utf-8")


def cell_value(value):
    return json_string(value) if isinstance(value,(dict,list,tuple,set)) else value


def write_workbook(path,tables):
    path.parent.mkdir(parents=True,exist_ok=True)
    options=dict(constant_memory=True,strings_to_formulas=False,strings_to_urls=False,tmpdir=str(path.parent))
    with xlsxwriter.Workbook(path,options) as book:
        book.set_properties(dict(title=path.stem,subject="Dados sintéticos demonstrativos",author="Team Move Intelligence"))
        header=book.add_format(dict(bold=True,bg_color="#1B3345",font_color="#FFFFFF",valign="vcenter",text_wrap=True))
        long_text=book.add_format(dict(text_wrap=True,valign="top"))
        num=book.add_format(dict(num_format='"R$" #,##0.00'))
        pct=book.add_format(dict(num_format="0.00%"))
        date_fmt=book.add_format(dict(num_format="dd/mm/yyyy"))
        stamp_fmt=book.add_format(dict(num_format="dd/mm/yyyy hh:mm:ss"))
        for table,rows in tables.items():
            if len(rows)>1_048_575:
                raise ValueError(f"{table} excede o limite do Excel: use CSV particionado.")
            ws=book.add_worksheet(table)
            if not rows:
                continue
            fields=list(rows[0])
            ws.hide_gridlines(2)
            ws.freeze_panes(1,0)
            ws.set_row(0,31)
            ws.autofilter(0,0,len(rows),len(fields)-1)
            formats=[]
            wrap=set()
            for col,field in enumerate(fields):
                ws.write(0,col,field,header)
                sample=[cell_value(r[field]) for r in rows[:100] if r[field] is not None]
                sample_max=max((len(str(v)) for v in sample),default=0)
                wrap_text=table in {"catalogo","products","product_variants","dicionario"} and field in {
                    "ingredients","ingredientes","description","descricao","regra","formula","observacao","exemplo"
                }
                width=max(13,min(64 if wrap_text else 46,max(len(field)+4,sample_max+5)))
                ws.set_column(col,col,width)
                if field.endswith("_brl") or field in {"ticket","receita","valor_total","valor_unitario","preco"}:
                    formats.append(num)
                elif field.endswith(("_share","_margin","_conversion","_growth")) or field in {"retention","support","confidence_a_b","confidence_b_a","uplift_pp","promo_roi","assumed_adoption","growth_last_vs_first_3_full_months"}:
                    formats.append(pct)
                elif wrap_text:
                    formats.append(long_text)
                    wrap.add(field)
                else:
                    formats.append(None)
            for i,row in enumerate(rows,1):
                if wrap and any(len(str(row[f] or ""))>=58 for f in wrap):
                    ws.set_row(i,34)
                for j,field in enumerate(fields):
                    value=cell_value(row[field])
                    fmt=formats[j]
                    if isinstance(value,datetime):
                        ws.write_datetime(i,j,value,stamp_fmt)
                    elif isinstance(value,date):
                        ws.write_datetime(i,j,value,date_fmt)
                    elif value is not None:
                        ws.write(i,j,value,fmt)


def verify_workbook(path,expected):
    with ZipFile(path) as archive:
        damaged = archive.testzip()
        if damaged:
            raise ValueError(f"{path.name} possui entrada ZIP inválida: {damaged}")
    book=load_workbook(path,read_only=True,data_only=False)
    counts={}
    try:
        if book.sheetnames!=list(expected):
            raise ValueError(f"Abas exportadas divergentes em {path.name}")
        for name,rows in expected.items():
            sheet=book[name]
            if not rows:
                counts[name]=0
                continue
            iterator=sheet.values
            header=next(iterator)
            if list(header)!=list(rows[0]) or sheet.max_row!=len(rows)+1:
                raise ValueError(f"Layout, cabeçalho ou número de linhas incorreto em {path.name}/{name}")
            first=next(iterator)
            fields=list(rows[0])
            for field,actual in zip(fields,first):
                want=cell_value(rows[0][field])
                if type(want) is date and isinstance(actual,datetime):
                    actual=actual.date()
                if isinstance(want,float) and isinstance(actual,(float,int)):
                    equal=isclose(want,actual,rel_tol=1e-14,abs_tol=1e-14)
                else:
                    equal=want==actual
                if not equal:
                    raise ValueError(f"Amostra divergente em {path.name}/{name}/{field}: {want!r} != {actual!r}")
            counts[name]=len(rows)
    finally:
        book.close()
    return counts


def write_csv(path,rows):
    if not rows:
        return
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("wb") as raw, gzip.GzipFile(filename="",fileobj=raw,mode="wb",mtime=0) as compressed:
        import io
        with io.TextIOWrapper(compressed,encoding="utf-8",newline="") as text:
            writer=csv.DictWriter(text,fieldnames=list(rows[0]),lineterminator="\n")
            writer.writeheader()
            writer.writerows({k:cell_value(v) for k,v in row.items()} for row in rows)


def write_parquet(path,rows):
    import pyarrow as pa
    import pyarrow.parquet as pq

    path.parent.mkdir(parents=True,exist_ok=True)
    table=pa.Table.from_pylist([{k:cell_value(v) for k,v in row.items()} for row in rows])
    pq.write_table(table,path,compression="zstd")
    reader=pq.ParquetFile(path)
    if reader.metadata.num_rows!=len(rows) or reader.schema_arrow.names!=list(rows[0]):
        raise ValueError(f"Falha na reabertura de {path.name}")


GRAINS = {
    "clientes":"cliente na projeção do importador","transacoes":"linha comercial do pedido; SKU principal",
    "catalogo":"SKU da projeção do importador","customers":"cliente identificado na organização",
    "transactions":"pedido concluído identificado","transaction_items":"linha comercial vinculada a um pedido",
    "transaction_addons":"SKU de adicional dentro de uma linha comercial","payments":"movimentação de pagamento capturada",
    "transaction_discounts":"desconto por pedido ou por item","product_variants":"SKU comercializável",
    "products":"família comercial de produtos","campaign_events":"evento simulado de uma atribuição",
    "campaign_audiences":"cliente atribuído a um braço por campanha","basket_affinity":"par de famílias por pedido distinto",
    "customer_rfm_snapshots":"cliente com compra observada até o fechamento mensal",
    "predictive_labels":"cliente, corte de features e horizonte de 30 dias", "cohort_metrics":"dimensão, categoria da coorte e janela",
    "customer_behavior_truth":"perfil latente e parâmetros de geração por cliente",
}
FORMULAS = {
    "product_gross_brl":"quantidade × preço unitário de tabela",
    "addons_gross_brl":"soma de doses × preço unitário por adicional do item",
    "product_subtotal_brl":"soma de products_gross das linhas do pedido",
    "addons_subtotal_brl":"soma de addons_gross das linhas do pedido",
    "gross_brl":"subtotal de produtos + subtotal de adicionais; valores agregados somam pedidos distintos",
    "net_brl":"bruto − desconto; agregação pela granularidade da tabela",
    "discount_allocated_brl":"desconto direto + diferença acumulada do rateio proporcional em centavos",
    "cmv_brl":"custos diretos consistentes com SKU, quantidade, embalagens e doses",
    "gross_profit_brl":"receita líquida − CMV",
    "gross_margin":"(receita líquida − CMV) ÷ receita líquida",
    "contribution_brl":"receita líquida − CMV − taxas de pagamento − comissão − subsídio",
    "contribution_margin":"contribuição ÷ receita líquida",
    "amount_due_brl":"receita líquida; frete ao consumidor não integra o modelo",
    "recency_days":"dias entre data de corte e último pedido no corte",
    "frequency":"pedidos distintos por cliente no período ou até o corte",
    "frequency_mean":"pedidos distintos ÷ compradores distintos no recorte",
    "monetary_brl":"soma de receita líquida até o corte",
    "historical_ltv_brl":"receita líquida realizada na janela observada",
    "ticket_brl":"receita líquida ÷ pedidos distintos",
    "retention":"clientes com segunda compra dentro da janela ÷ clientes cuja janela está completa",
    "retention_60d":"segunda compra na rede em 60 dias, por loja da primeira compra, com janela completa",
    "points_balance":"pontos creditados − resgatados − expirados",
    "uplift_pp":"taxa de conversão tratamento − taxa controle",
    "estimated_incremental_revenue_brl":"diferença de receita média por pessoa entre braços × tamanho tratamento",
    "estimated_incremental_contribution_brl":"diferença de contribuição média × tamanho tratamento − custo de envios",
    "promo_roi":"contribuição incremental líquida ÷ custo de envios",
    "lift":"probabilidade conjunta ÷ produto das duas probabilidades marginais",
    "confidence_a_b":"pedidos com A e B ÷ pedidos com A",
    "confidence_b_a":"pedidos com A e B ÷ pedidos com B",
    "support":"pedidos com A e B ÷ pedidos válidos",
    "potential_revenue_brl":"público único × taxa hipotética × unidades × valor incremental",
    "potential_contribution_brl":"receita potencial × margem hipotética − custo por adesão × adesões",
}
PRIVACY_FIELDS = {"full_name","birth_date","name","email","phone","document_id","document_fixture","communication_consent",
                  "customer_id","cliente_id","external_customer_id","external_id","nascimento","telefone"}
DESCRIPTIONS = {
    "organization_id":"Identificador do ambiente lógico da organização.",
    "customer_id":"Chave estável do cliente, compartilhada por todas as lojas.",
    "external_customer_id":"Identificador de origem fictício, independente da chave interna.",
    "full_name":"Nome brasileiro composto de forma sintética.",
    "birth_date":"Nascimento fictício usado para calcular idade na referência.",
    "age_group":"Faixa etária na data de referência, conforme cotas configuradas.",
    "acquisition_store_id":"Unidade associada à aquisição simulada ou, na coorte, à primeira compra observada.",
    "first_store_id":"Loja da primeira compra dentro do histórico disponível.",
    "preferred_store_id":"Loja mais frequente no histórico observado.",
    "store_id":"Chave DEMO da unidade que registra a operação.",
    "transaction_id":"Chave comercial que agrupa as linhas do pedido.",
    "sale_datetime":"Data e hora local da compra concluída.",
    "item_id":"Chave da linha comercial, referenciada pelos adicionais.",
    "sku":"Código demonstrativo da variante comercial ou adicional.",
    "assigned_date":"Data de elegibilidade e atribuição ao braço, anterior à conversão.",
    "is_censored":"Indica seguimento inferior ao horizonte pedido.",
    "outbound_messaging_enabled":"Flag de configuração mantida falsa em toda a demonstração.",
    "communication_consent":"Consentimento fictício destinado apenas aos experimentos offline.",
    "period_start":"Primeiro dia do histórico comercial de 12 meses completos.",
    "period_end":"Último dia do histórico comercial de 12 meses completos.",
    "is_vip":"Cliente com frequência mínima e gasto acumulado no percentil configurado.",
    "is_risk":"Risco operacional calculado com recência e intervalo individual.",
    "growth_last_vs_first_3_full_months":"Variação da receita entre os três últimos e os três primeiros meses completos da unidade.",
}


def dictionary(groups):
    out=[]
    for location,tables in groups.items():
        for table,rows in tables.items():
            if not rows:
                continue
            for field in rows[0]:
                values=[r[field] for r in rows]
                sample=next((v for v in values if v is not None),None)
                fallback=("data" if field.endswith(("_date","_at")) else "decimal" if field.endswith(("_brl","_bps","_g")) else
                          "inteiro" if field.endswith(("_days","_hour","_minutes")) else "texto")
                kind={bool:"booleano",int:"inteiro",float:"decimal",date:"data",datetime:"data e hora",str:"texto",
                      dict:"objeto JSON",list:"lista JSON"}.get(type(sample),fallback)
                fk=target(table,field)
                key=field in KEYS.get(table,())
                unit="BRL" if field.endswith("_brl") else "centavos" if field.endswith("_cents") else "dias" if field.endswith("_days") else "bps" if field.endswith("_bps") else "mL" if field.endswith("_ml") else "g" if field.endswith("_g") else None
                domain=None
                if kind in {"texto","booleano"}:
                    unique=list(dict.fromkeys(v for v in values if v is not None))
                    if len(unique)<=12:
                        domain=" | ".join(map(str,unique))
                category="latente" if table=="customer_behavior_truth" else "label futuro" if table=="predictive_labels" else "derivado" if (field in FORMULAS or table.endswith(("metrics","snapshots"))) else "dado sintético"
                source="cardápio fornecido" if table in {"product_variants","products","addons","price_history"} and field in (
                    "name","size","price_brl","price_per_dose_brl","protein_g","ingredients","listed_unit_price_brl") else category
                out.append(dict(arquivo=location,tabela=table,campo=field,
                                descricao=DESCRIPTIONS.get(field) or FORMULAS.get(field) or field.replace("_"," ").capitalize(),
                                tipo=kind,formato="aaaa-mm-dd" if kind=="data" else "data/hora local São Paulo" if kind=="data e hora" else "número com duas casas" if unit=="BRL" else kind,
                                unidade=unit,obrigatorio=key or not any(v is None for v in values),
                                permite_nulo=not key and any(v is None for v in values),nulo_observado=any(v is None for v in values),
                                chave_primaria=key,chave_estrangeira=".".join(fk) if fk else None,dominio_observado=domain,
                                exemplo=cell_value(sample),origem=source,regra=FORMULAS.get(field) or ("FK obrigatória quando preenchida" if fk else None),
                                formula=FORMULAS.get(field),granularidade=GRAINS.get(table) or ("chave "+", ".join(KEYS.get(table,())) if table in KEYS else "linha do layout/fixture"),
                                observacao="Nulidade e obrigatoriedade fora da PK descrevem a execução, com opcionais conforme a configuração.",
                                classificacao_privacidade="identidade sintética" if field in PRIVACY_FIELDS and table not in {"products","product_variants","addons"} else
                                "gabarito restrito" if location=="ground_truth" else "dados comerciais sintéticos"))
    return out
