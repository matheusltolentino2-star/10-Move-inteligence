/* Importação e consulta das tabelas relacionadas do lote nacional. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const F=MI.fullData;
  const state={message:'',error:'',fraction:0,table:'financeiro',skip:0,store:'',request:0};
  const LABEL={clientes:'Clientes',catalogo:'Catálogo',lojas:'Lojas',pedidos:'Pedidos',itens:'Itens de consumo',
    geografia:'Geografia',microterritorios:'Microterritórios',contexto_social:'Contexto socioeconômico',
    mobilidade:'Mobilidade',operacao:'Operação diária',financeiro:'Financeiro mensal',custos:'Custos diários',
    disponibilidade:'Disponibilidade',campanhas:'Campanhas',exposicoes:'Participantes de campanha',pesquisas:'Pesquisas de consumo',
    recorrencia:'Recorrência por loja',matriz_integracao:'Matriz de integração',dicionario:'Dicionário de dados'};
  const STORE_TABLES=new Set(['lojas','pedidos','operacao','financeiro','custos','disponibilidade','recorrencia']);
  const FIELDS={
    financeiro:['store_id','month','completed_transactions','net_revenue_brl','cogs_brl','operating_result_brl','marketing_investment_brl'],
    operacao:['store_id','date','open_hours','estimated_footfall','completed_transactions','conversion_rate','average_service_minutes','stockout_skus','net_revenue_brl'],
    microterritorios:['microterritory_id','uf','city','district','neighborhood','customers','covered_delivery_stores','net_brl']
  };
  const CAPTIONS={store_id:'Loja',month:'Mês',date:'Data',completed_transactions:'Pedidos',net_revenue_brl:'Receita líquida',
    operating_result_brl:'Resultado operacional',cogs_brl:'CMV',marketing_investment_brl:'Marketing',
    open_hours:'Horas abertas',estimated_footfall:'Fluxo estimado',conversion_rate:'Conversão',
    average_service_minutes:'Atendimento (min)',stockout_skus:'Rupturas',city:'Município',district:'Distrito',
    neighborhood:'Bairro',customers:'Clientes',covered_delivery_stores:'Lojas cobrindo o centro',net_brl:'Líquido',
    microterritory_id:'Microterritório',uf:'UF'};
  const info=(k,v)=>({k,v});
  function display(x,k) {
    if(x==null || x==='') return '—';
    if(k.endsWith('_brl') && typeof x==='number') return MI.fmt.money(x);
    if(k.endsWith('_rate') && typeof x==='number') return MI.fmt.pct(x,1);
    if(typeof x==='boolean') return x ? 'Sim' : 'Não';
    return String(x);
  }
  async function selected(file) {
    if(!file || F.busy || F.active)return;
    state.error=''; state.message='Lendo metadados do arquivo…'; state.fraction=0;
    const pending=F.prepare(file,p=>{
      state.message=p.phase || 'Validando '+p.sheet+' · '+MI.fmt.int(p.done)+'/'+MI.fmt.int(p.total)+' linhas';
      state.fraction=p.fraction;
      const label=MI.$('#full-import-progress-label'), bar=MI.$('#full-import-progress');
      if(label)label.textContent=state.message;
      if(bar)bar.value=state.fraction;
    });
    MI.app.rerender();
    try {
      const batch=await pending;
      state.message='Ativando as fontes validadas…'; MI.app.rerender();
      await new Promise(resolve=>setTimeout(resolve,0));
      F.activate(batch);
      state.table='financeiro'; state.skip=0; state.store='';
      MI.toast(MI.fmt.int(batch.stats.customers)+' clientes e '+MI.fmt.int(batch.stats.orders)+' pedidos ativados.','ok');
    } catch(error) {
      state.error=error.message;
    } finally {
      state.message=''; MI.app.rerender();
    }
  }
  F.openFromPicker=function(file) {
    MI.views.settings.abrirAba('dados','lote');
    if(MI.app.current!=='settings') MI.app.go('settings');
    if(F.busy || F.active) MI.app.rerender();
    else void selected(file);
  };
  function preview(host) {
    const el=MI.el,U=MI.ui,batch=F.active,request=++state.request;
    const filter=state.store && STORE_TABLES.has(state.table)?{field:'store_id',value:state.store}:null;
    F.page(state.table,state.skip,25,filter).then(page=>{
      if(request!==state.request || !host.isConnected || F.active!==batch)return;
      MI.clear(host);
      if(!page.rows.length) {
        host.appendChild(U.empty('Nenhuma linha neste recorte'));
        return;
      }
      const names=FIELDS[state.table] || page.fields, columns=names.map(k=>page.fields.indexOf(k));
      host.appendChild(U.table(names.map(k=>({label:CAPTIONS[k] || k})),page.rows.map(row=>({
        cells:names.map((key,i)=>({v:display(row[columns[i]],key),num:typeof row[columns[i]]==='number'}))
      }))));
      const refresh=n=>{state.skip=n;preview(host);};
      host.appendChild(el('div',{style:'display:flex;gap:8px;align-items:center;margin-top:14px'},[
        U.btn('Página anterior',{disabled:!state.skip,onClick:()=>refresh(Math.max(0,state.skip-25))}),
        el('span',{text:'Linhas '+MI.fmt.int(state.skip+1)+'–'+MI.fmt.int(state.skip+page.rows.length)}),
        U.btn('Próxima página',{disabled:!page.hasMore,onClick:()=>refresh(state.skip+25)})
      ]));
    }).catch(error=>{
      if(request===state.request && host.isConnected) {
        MI.clear(host); host.appendChild(U.note('crit',error.message));
      }
    });
  }
  F.render=function(root) {
    const el=MI.el,U=MI.ui;
    if(!F.canImport()) {
      root.appendChild(U.card({span:'c12',title:'Lote nacional simulado',
        body:U.unavailable('A carga local exige a perspectiva Administrador Smoov')}));
      return;
    }
    if(state.error)root.appendChild(U.note('crit',['A carga foi recusada. A base ativa foi preservada. ',state.error]));
    const batch=F.active;
    if(!batch) {
      const file=el('input',{id:'full-import-file',type:'file',accept:'.xlsx',style:'display:none',
        onchange:e=>selected(e.target.files[0])});
      root.appendChild(U.card({span:'c12',title:'Importar lote completo',
        sub:'Selecione SMOOV_INTELLIGENCE_FULL_DATASET.xlsx para carregar as fontes relacionadas em uma operação.',
        body:state.message ? [
          el('p',{id:'full-import-progress-label','aria-live':'polite',text:state.message}),
          el('progress',{id:'full-import-progress',value:state.fraction,max:1,style:'width:100%'})
        ] : [
          U.note('info','O lote simulado fica nesta sessão. Desativar o lote restaura as fontes que estavam abertas.'),
          el('div',{style:'margin-top:14px'},[U.btn('Selecionar e importar Excel',{variant:'accent',icon:'upload',
            disabled:F.busy,onClick:()=>file.click()}),file])
        ]}));
      return;
    }
    const s=batch.stats;
    root.appendChild(U.card({span:'c12',title:'SMOOV Nacional · lote simulado ativo',
      sub:batch.file.name+' · '+batch.meta.info.get('inicio')+' a '+batch.meta.info.get('fim'),
      tools:[U.btn('Desativar lote e restaurar fontes',{onClick:function(){F.remove();MI.app.rerender();}})],
      body:[U.statline([info('Clientes',MI.fmt.int(s.customers)),info('Municípios',MI.fmt.int(s.cities)),
        info('Lojas',MI.fmt.int(s.stores)),info('Pedidos',MI.fmt.int(s.orders)),info('Itens vendidos',MI.fmt.int(s.units)),
        info('Receita líquida',MI.fmt.money(s.netCents/100))]),
      el('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:15px'},[
        U.btn('Abrir Consumo',{onClick:()=>MI.app.go('consumption')}),
        U.btn('Abrir Geografia',{onClick:()=>MI.app.go('geography')}),
        U.btn('Abrir Segmentação',{onClick:()=>MI.app.go('segmentation')}),
        U.btn('Abrir Oportunidades',{onClick:()=>MI.app.go('opportunities')})
      ])]}));
    const view=el('div',{},[el('p',{text:'Carregando tabela…'})]);
    const chooser=el('select',{class:'input','aria-label':'Tabela do lote'},Object.entries(LABEL).map(([k,label])=>
      el('option',{value:k,selected:k===state.table},label)));
    chooser.addEventListener('change',()=>{state.table=chooser.value;state.skip=0;state.store='';MI.app.rerender();});
    const stores=el('select',{class:'input','aria-label':'Loja da tabela'},[
      el('option',{value:''},'Todas as lojas'),
      ...batch.units.map(u=>el('option',{value:u.id,selected:u.id===state.store},u.nome))
    ]);
    stores.addEventListener('change',()=>{state.store=stores.value;state.skip=0;preview(view);});
    root.appendChild(U.card({span:'c12',title:'Tabelas relacionadas do lote',
      tools:[chooser,STORE_TABLES.has(state.table)?stores:null].filter(Boolean),body:view}));
    preview(view);
  };
  F.geographicDetail=function() {
    if(!F.active || !F.canImport())return null;
    const st=MI.store,U=MI.ui,el=MI.el;
    if(!st.filters._cidade || Array.from(st.filters._cidade.values).length!==1)return null;
    const groups=new Map(), micros=new Map(F.active.micros.map(g=>[g.microterritory_id,g]));
    st.rows.forEach(c=>{
      const key=c.distrito+'|'+c.bairro;
      if(!groups.has(key))groups.set(key,{district:c.distrito,neighborhood:c.bairro,customers:0,covered:0});
      const row=groups.get(key);
      row.customers++;
      if(micros.get(c.home_microterritory_id)?.covered_delivery_stores>0)row.covered++;
    });
    const rows=Array.from(groups.values()).sort((a,b)=>b.customers-a.customers).slice(0,40);
    return U.card({span:'c12',title:'Distritos, bairros e área de influência',
      sub:'Cobertura logística calculada em linha reta a partir de microterritórios e lojas simuladas.',
      body:U.table([{label:'Distrito ou referência administrativa'},{label:'Bairro ou região comercial'},
        {label:'Clientes'},{label:'Clientes no raio de delivery'}],rows.map(r=>({cells:[
        {v:el('button',{class:'chip',type:'button',onclick:()=>st.setFilter('distrito',{kind:'cat',raw:'distrito',values:[r.district]})},r.district)},
        {v:el('button',{class:'chip',type:'button',onclick:()=>st.setFilter('_bairro',{kind:'cat',values:[r.neighborhood]})},r.neighborhood)},
        {v:MI.fmt.int(r.customers),num:true},{v:MI.fmt.int(r.covered),num:true}
      ]})))});
  };
})(window.MI);
