"""Human-readable reports from executed simulation results."""

from pathlib import Path


def br(value,places=2):
    return f'{value:,.{places}f}'.translate(str.maketrans(",.",".,"))


def pct(value):
    return f'{br(value*100,1)}%' if value is not None else "—"


def brl(value):
    return "R$ "+br(value)


def integer(n):
    return br(n,0)


def write_md(path,lines):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text("\n".join(lines)+"\n",encoding="utf-8")


def write_reports(out,report,scenarios,analytics):
    base = Path(out)/"reports"
    m=report["business"]
    checks=report["checks"]
    passed=sum(c["status"]=="PASS" for c in checks)
    not_observed=[s["name"] for s in scenarios if s["status"]!="observado"]
    write_md(base/"validation_report.md",[
        "# Validação da SMOOV DEMO","",
        f"Perfil **{report['profile']}** · {report['period_start']} a {report['period_end']} · semente {report['seed']}.","",
        f"**{passed} aprovações de {len(checks)} verificações do gerador.** "
        f"Foram observados {m['observed_scenarios']} de {m['total_scenarios']} cenários pelos detectores independentes. "
        "A identificação de cada cenário pela interface ou por modelos da plataforma ainda precisa ser avaliada.","",
        "**Cenários aquém do limiar**","",
        *([f"- {name}" for name in not_observed] or ["- Todos atingiram o limiar."]),"",
        "| Verificação | Resultado | Observado | Critério |","|---|---|---|---|",
        *(f"| {c['check_id']} | {c['status']} | {c['observed'] if not isinstance(c['observed'],dict) else 'por chave no JSON'} | "
          f"{c['expected'] if not isinstance(c['expected'],dict) else 'por chave no JSON'} |" for c in checks),"",
        "A reabertura conferiu integridade ZIP, abas, cabeçalhos, contagens declaradas e valores da primeira linha de cada aba. "
        "O resultado detalhado fica no JSON. O teste do importador é executado separadamente e escreve `import_test.json`.","",
        "Os tempos e a memória referem-se ao processo local de geração. O Supabase e o desempenho dos dashboards ficam fora deste benchmark."
    ])
    writes = [
        "# Resumo comercial da SMOOV DEMO","",
        f"{report['period_start']} a {report['period_end']} · {integer(m['customers'])} clientes e {integer(m['orders'])} compras concluídas identificadas. "
        "Indicadores calculados sobre a amostra sintética.","",
        "| Indicador | Resultado |","|---|---:|",
        f"| Receita bruta | {brl(m['gross_brl'])} |",f"| Receita líquida comercial | {brl(m['net_brl'])} |",
        f"| Ticket médio | {brl(m['ticket_brl'])} |",f"| Frequência média / mediana | {br(m['frequency_mean'],1)} / {br(m['frequency_median'],1)} |",
        f"| Margem bruta | {pct(m['gross_margin'])} |",
        f"| Contribuição / margem de contribuição | {brl(m['contribution_brl'])} / {pct(m['contribution_margin'])} |",
        f"| Clientes multiloja | {integer(m['multistore'])} |",f"| Clientes com duas ou mais compras | {integer(m['recurring'])} |",
        f"| Clientes VIP | {integer(m['vip'])} |",f"| Clientes inativos, incluindo perdidos operacionais | {integer(m['inactive'])} |",
        f"| Clientes em risco pelo intervalo habitual | {integer(m['at_risk'])} |",f"| Clientes com retorno após hiato ≥60 dias | {integer(m['reactivated'])} |",
        f"| Ticket P10 / P50 / P90 | {brl(m['ticket_p10_brl'])} / {brl(m['ticket_p50_brl'])} / {brl(m['ticket_p90_brl'])} |","",
        "## Unidades","",
        "| Unidade | Clientes | Compras | Receita líquida | Ticket | Frequência | Recompra 60d | Margem contribuição | Crescimento¹ | Pedidos com adicional |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for s in sorted(analytics["store_metrics"],key=lambda r:r["net_brl"],reverse=True):
        writes.append(f"| {s['store_name']} | {integer(s['customers'])} | {integer(s['orders'])} | {brl(s['net_brl'])} | {brl(s['ticket_brl'])} | "
                      f"{br(s['frequency_mean'],2)} | {pct(s['retention_60d'])} | {pct(s['contribution_margin'])} | "
                      f"{pct(s['growth_last_vs_first_3_full_months'])} | {pct(s['addons_order_share'])} |")
    writes += ["","¹ Variação de receita entre os três primeiros e os três últimos meses completos da própria loja. A recompra compara clientes "
               "adquiridos em cada unidade e considera retorno a qualquer loja. Clientes por loja podem se sobrepor.","",
               "Os custos são cenários sintéticos. A margem de contribuição considera CMV, taxas, comissões e subsídio de entrega."]
    write_md(base/"business_summary.md",writes)
    write_playbook(base/"demo_playbook.md",m,analytics)


def write_playbook(path,m,a):
    stores=a["store_metrics"]
    highest=max(stores,key=lambda r:r["ticket_brl"])
    lowest=min(stores,key=lambda r:r["ticket_brl"])
    retention=[r for r in stores if r["retention_60d"] is not None]
    retained=max(retention,key=lambda r:r["retention_60d"])
    best_product=max(a["product_metrics"],key=lambda r:r["units"])
    best_pair=max((r for r in a["basket_affinity"] if r["orders"]>=max(3,m["orders"]*.005)),
                  key=lambda r:r["lift"],default=None)
    best_campaign=max((r for r in a["campaign_metrics"] if r["uplift_pp"] is not None and r["n_control"]>=5),
                      key=lambda r:r["uplift_pp"],default=None)
    rf={}
    for row in a["customer_metrics"]:
        rf[row["rf_segment"]]=rf.get(row["rf_segment"],0)+1
    example=a["opportunities"]
    portfolio=sum(r["potential_contribution_brl"] for r in example if r["case"]=="base")
    steps=[
        ("Visão executiva","Qual o tamanho da operação simulada?","Visão Geral e `transactions`",
         f"{integer(m['orders'])} compras, {brl(m['net_brl'])} líquidos, ticket ponderado de {brl(m['ticket_brl'])}.",
         "Validar a mesma receita em clientes e consumo. Para ticket ponderado, usar receita dividida por pedidos.","A plataforma pode exibir média simples de tickets por cliente."),
        ("Perfil de clientes","Quem compõe a base em cada praça?","Perfil e Geografia; idade, gênero, cidade e bairro",
         f"{integer(m['customers'])} clientes identificados, com distribuição de idade configurada.",
         "Filtrar a praça e comparar a composição dos recortes.","Os padrões demográficos são premissas da amostra."),
        ("Comparação entre franquias","Onde ticket e recompra diferem?","Filtro de unidade preferida e `store_metrics`",
         f"{highest['store_name']} registra {brl(highest['ticket_brl'])} por compra e {lowest['store_name']}, {brl(lowest['ticket_brl'])}. {retained['store_name']} tem recompra em 60 dias de {pct(retained['retention_60d'])}.",
         "Usar meses completos e compartilhar práticas entre lojas do mesmo estágio.","O filtro de clientes por loja preferida tem denominador diferente da loja da transação."),
        ("Segmentação RFV","Quais grupos a plataforma infere?","Segmentação; recência, frequência, valor e `customer_rfm_snapshots`",
         ", ".join(f"{key} {integer(val)}" for key,val in sorted(rf.items(),key=lambda p:-p[1]) if key),
         "Comparar o RF do recorte com o snapshot final da rede.","O rótulo nativo é função de R e F. Valor monetário informa o segmento."),
        ("Clientes VIP","Onde se concentra valor?","`customer_metrics` e relatórios de concentração",
         f"{integer(m['vip'])} VIPs pelo histórico e frequência mínima.",
         "Inspecionar a distribuição por loja e priorizar os VIPs com intervalo recente maior.","VIP é regra complementar e depende da janela."),
        ("Clientes em risco","Quem superou sua cadência habitual?","Segmentação nativa e `customer_metrics`",
         f"{integer(m['at_risk'])} em risco pelo critério longitudinal complementar.",
         "Comparar o resultado com o segmento RF do app e investigar a divergência.","Risco operacional em varejo é uma inferência."),
        ("Produtos","Que SKUs lideram em unidades?","Consumo, catálogo e `product_metrics`",
         f"{best_product['product']} tem um SKU com {integer(best_product['units'])} unidades.",
         "Planejar disponibilidade e acompanhar margem.","Agregações por família e SKU podem produzir rankings diferentes."),
        ("Inteligência de cesta","Quais itens aparecem juntos?","Consumo e `basket_affinity`",
         f"{best_pair['product_a']} e {best_pair['product_b']} têm lift {br(best_pair['lift'])}." if best_pair else "Suporte insuficiente para este recorte.",
         "Conferir suporte antes de propor um combo.","Lift mede associação. Adicionais permanecem no detalhe complementar."),
        ("Cross-selling","Que complemento vale testar?","Consumo, cenários e `opportunities`",
         f"{pct(m['addons_order_share'])} dos pedidos já têm algum adicional.",
         "Selecionar clientes sem o complemento e simular um teste com controle.","Suplementos exigem elegibilidade adulta e contatos são fictícios."),
        ("Upselling","Quem prefere 360 ml?","Consumo por tamanho e `customer_metrics`",
         f"{integer(sum(r['frequency']>=3 and r['preferred_size']=='360 ml' for r in a['customer_metrics']))} clientes com ≥3 compras e preferência por 360 ml.",
         "Testar a troca em público elegível, com medição de margem e adesão.","Preferência é inferida por moda."),
        ("Rentabilidade","Os canais geram a mesma contribuição?","`channel_metrics` e `transactions`",
         ", ".join(f"{r['channel']} {pct(r['contribution_margin'])}" for r in a["channel_metrics"]),
         "Comparar canibalização e custo variável antes de promover canais.","Visão complementar. Custos são simulados e despesas fixas ficam fora."),
        ("Campanhas","Qual janela mostrou ganho incremental?","Públicos sugeridos no app e `campaign_metrics`",
         f"{best_campaign['campaign_id']} registrou {br(best_campaign['uplift_pp']*100,1)} p.p. de diferença tratamento–controle." if best_campaign else "Amostra insuficiente.",
         "Inspecionar grupos, custo e contribuição antes de priorizar a ação.","Os envios são simulados. A antecipação pode redistribuir compras ao longo do ano."),
        ("Reativação","Quantos voltaram após um intervalo longo?","`customer_metrics`, `campaign_results` e ciclo de vida",
         f"{integer(m['reactivated'])} clientes voltaram após hiato de pelo menos 60 dias.",
         "Comparar retorno isolado com recompra subsequente.","O retorno após hiato pode ocorrer espontaneamente."),
        ("Multiloja","Quem usa mais de uma unidade?","Chave global e `customer_metrics`",
         f"{integer(m['multistore'])} clientes compraram em duas ou mais lojas.",
         "Distinguir loja de aquisição, preferência e gasto.","Unidades de interesse não constituem autorização por loja."),
        ("Oportunidades financeiras","Quanto renderia uma carteira sem duplicação?","`opportunities`",
         f"{brl(portfolio)} de contribuição potencial no caso base.",
         "Revisar as taxas de adesão e a ordem de prioridade.","Cenário hipotético, com custos variáveis e premissas de exposição."),
        ("Previsões","Como validar propensão ao próximo pedido?","Snapshots mensais e labels datados no gabarito",
         "Horizonte de 30 dias, cortes temporais e indicadores de censura.",
         "Treinar e medir em meses posteriores ao treino, com PR-AUC ou precision@K conforme a decisão.","Não há previsão calculada nesta versão do app."),
    ]
    lines=["# Roteiro de demonstração da SMOOV DEMO","","Carregue manualmente `Clientes`, `Catalogo` e `Transacoes` no ambiente de demonstração escolhido. "
           "Use os painéis e as análises complementares indicados nas etapas. Os valores abaixo foram calculados nesta execução.",""]
    for i,(title,q,where,fact,action,limit) in enumerate(steps,1):
        lines.extend([f"## {i}. {title}","",f"**{q}**", "",f"{fact} Consulte {where}.","",f"{action} {limit}",""])
    write_md(path,lines)
