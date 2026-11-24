"""Isolated quality, identity and exception fixtures."""

from datetime import timedelta

from .model import rid


def fixture_sets(org,start,end):
    base = [dict(customer_id=f'DEMO-RAW-C{i:02}',external_customer_id=f'DEMO-RAW-X{i:02}',
                 full_name=f'{name} DEMO',data_cadastro=start.isoformat(),email=f'raw{i}@example.com',
                 telefone=f'DEMO-NR-RAW{i:02}',status="fidelizado",is_synthetic=True,extra_coluna=None)
            for i,name in enumerate(("Bia Nóbrega","Leo Campos","Rui Duarte","Nina Azevedo","Téo Farias",
                                     "Mila Ferreira","Lia Carneiro","Caio Dias","Lola Antunes","Luiz Coelho"),1)]
    orders = [dict(pedido_id=f'DEMO-RAW-P{i:02}',cliente_id=c["customer_id"],sku="DEMO-SKU-001",produto="Smoov Classic",
                   data_pedido=(start+timedelta(i)).isoformat(),quantidade=1,valor_unitario=16.99,valor_total=16.99,
                   unidade="SMOOV Faria Lima",extra_coluna=None)
              for i,c in enumerate(base,1)]
    raw_customers,raw_orders=[dict(r) for r in base],[dict(r) for r in orders]
    errors=[]

    def inject(table,n,column,value,kind,action,expectation):
        rows=raw_customers if table=="clientes_raw" else raw_orders
        record=rows[n]
        field=next(iter(record))
        original=record[column] if column else dict(record)
        if column:
            record[column]=value
        else:
            rows.append(dict(record))
        errors.append(dict(error_id=f'ERR-{len(errors)+1:02}',sheet=table,excel_row=(n+2 if column else len(rows)+1),
                           record_id=record[field],field=column,original=original,modified=value if column else "linha duplicada",
                           error_type=kind,expected_action=action,expected_current_importer=expectation,
                           can_auto_correct=action=="normalizar",quarantine=action in {"quarentena","rejeitar"}))

    inject("clientes_raw",1,"customer_id",base[0]["customer_id"],"ID cliente duplicado","quarentena","diagnóstico de duplicidade")
    inject("clientes_raw",2,"external_customer_id",base[0]["external_customer_id"],"ID externo duplicado","quarentena","diagnóstico depende do papel de ID")
    inject("clientes_raw",3,"data_cadastro",start.strftime("%d/%m/%Y"),"data pt-BR","normalizar","data reconhecível")
    inject("clientes_raw",4,"full_name","  Teo  Farias   DEMO  ","espaços e acento","normalizar","sem resolução de identidade")
    inject("clientes_raw",5,"email",None,"campo opcional ausente","aceitar","vazio")
    inject("clientes_raw",6,"email","fixture-sem-arroba","contato inválido","quarentena","formato de e-mail sem validação nativa")
    inject("clientes_raw",7,None,None,"cliente duplicado integral","quarentena","diagnóstico de duplicidade")
    inject("clientes_raw",8,"extra_coluna","fixture","coluna adicional","aceitar","coluna inferida")
    inject("clientes_raw",9,"status","desconhecido","status fora de domínio","quarentena","status livre no importador")
    inject("itens_raw",0,"valor_total","R$ 16,99","monetário pt-BR","normalizar","parse de moeda")
    inject("itens_raw",1,"sku","DEMO-SKU-INEXISTENTE","SKU divergente","quarentena","nome pode casar por fallback")
    inject("itens_raw",2,"cliente_id","DEMO-RAW-NUNCA","cliente órfão","rejeitar","item aceito sem vínculo")
    inject("itens_raw",3,"valor_total",99.99,"total divergente","rejeitar","total informado aceito sem conciliação")
    inject("itens_raw",4,"data_pedido",(end+timedelta(days=50)).isoformat(),"data fora do período","rejeitar","data aceita sem janela de negócio")
    inject("itens_raw",5,None,None,"item duplicado integral","rejeitar","item aceito sem deduplicação")
    inject("itens_raw",6,"quantidade",-1,"quantidade negativa","rejeitar","normaliza para 1")
    inject("itens_raw",7,"produto",None,"nome ausente, SKU válido","aceitar","SKU permite importação")
    inject("itens_raw",8,"valor_total",-50,"receita negativa","rejeitar","valor aceito sem regra financeira")
    incomplete=[dict(pedido_id="DEMO-RAW-INCOMP",cliente_id=base[5]["customer_id"],unidade="SMOOV Faria Lima")]
    errors.append(dict(error_id="ERR-19",sheet="arquivo_incompleto",excel_row=2,record_id="DEMO-RAW-INCOMP",field=None,
                       original="layout de itens com SKU/produto",modified="ambos os campos ausentes",error_type="arquivo incompleto",
                       expected_action="rejeitar",expected_current_importer="UI bloqueia aplicação sem produto/SKU",
                       can_auto_correct=False,quarantine=True))

    identity,pairs=[],[]
    cases=[
        ("grafia",["Malu Soares Nunes","Malu Soáres Nunes"],True),
        ("cadastro multiloja",["Lino Dutra Mendes","Lino Dutra Mendes"],True),
        ("mudança de e-mail",["Ciça Lopes Vaz","Ciça Lopes Vaz"],True),
        ("mudança de contato",["Hugo Sales Ramos","Hugo Sales Ramos"],True),
        ("erro de digitação",["Nara Pires Tavares","Nara Pires Taveras"],True),
        ("IDs externos diferentes",["Ivo Barros Diniz","Ivo Barros Diniz"],True),
        ("homônimos",["Lúcia Teixeira Paiva","Lúcia Teixeira Paiva"],False),
        ("homônimos com pouca informação",["Rui Costa Dias","Rui Costa Dias"],False),
    ]
    for i,(case,names,same) in enumerate(cases,1):
        ids=[]
        for j,name in enumerate(names,1):
            k=f'DEMO-ID-{i:02}-{j}'
            same_key=f'{i:02}' if same else f'{i:02}-{j}'
            ids.append(k)
            identity.append(dict(record_id=k,organization_id=org,external_id=f'DEMO-ID-X{i:02}-{j}',
                                 name=name,store_code="FL" if j==1 else "MO",
                                 document_fixture=f'DEMO-ID-DOC-{same_key}' if i!=8 else None,
                                 email=f'demo-id-{same_key}-{j if i==3 else 1}@example.com' if i!=8 else None,
                                 phone=f'DEMO-NR-ID-{same_key}-{j if i==4 else 1}' if i!=8 else None,is_synthetic=True))
        pairs.append(dict(case_id=f'ID-{i:02}',case_type=case,left_record_id=ids[0],right_record_id=ids[1],expected_match=same,
                          canonical_left=f'DEMO-PERSON-{i:02}-1',canonical_right=f'DEMO-PERSON-{i:02}-{1 if same else 2}',
                          rationale="documento de teste comum" if same else "identidades separadas; nome igual é insuficiente"))
    exceptions,events=[],[]
    configs=[
        ("cancelado",False,0,0,["criado","cancelado"]),
        ("recusado",False,0,0,["criado","pagamento_recusado"]),
        ("reembolsado",True,4250,4250,["criado","capturado","reembolso_integral"]),
        ("devolução parcial",True,4250,1200,["criado","capturado","devolução_parcial"]),
        ("estornado",True,3699,3699,["criado","capturado","estorno_integral"]),
        ("cupom inválido",False,0,0,["criado","cupom_rejeitado"]),
        ("duplicado integração",False,0,0,["criado","evento_duplicado_quarentenado"]),
        ("abandonado",False,0,0,["criado","expirado"]),
        ("anônimo",True,3299,0,["criado","capturado"])
    ]
    for i,(kind,closed,captured,returned,states) in enumerate(configs,1):
        key=rid("EXC",i)
        exceptions.append(dict(exception_order_id=key,organization_id=org,case_type=kind,status=kind,
                               identified_customer=kind!="anônimo",completed_ever=closed,include_gold=False,
                               invoiced_brl=captured/100,captured_brl=captured/100,reversed_brl=returned/100,
                               received_net_brl=(captured-returned)/100,is_synthetic=True))
        for j,state in enumerate(states):
            events.append(dict(exception_event_id=rid("EEV",len(events)+1),exception_order_id=key,
                               event_date=start+timedelta(days=30+i+j),event_type=state,
                               cash_delta_brl=captured/100 if state=="capturado" else -returned/100 if j==2 else 0))
    return (dict(clientes_raw=raw_customers,itens_raw=raw_orders,arquivo_incompleto=incomplete),
            dict(identity_records=identity),dict(exception_orders=exceptions,exception_events=events),errors,pairs)
