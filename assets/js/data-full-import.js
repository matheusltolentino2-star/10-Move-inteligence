/* Lote nacional sintético. O arquivo é validado em memória temporária antes da troca de fontes da sessão. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const DAY = 86400000;
  const SOURCE = 'lote-sintetico';
  const TABLES = {
    catalogo:'sku produto categoria tamanho preco', clientes:'cliente_id idade nascimento genero uf cidade bairro distrito ibge_city_code data_cadastro data_primeira_compra data_ultima_compra compras receita ticket recencia_dias latitude longitude home_territory_id home_microterritory_id loja_preferida_id sku_preferido',
    lojas:'store_id name ownership commercial_format territory_id city uf ibge_city_code latitude longitude opening_date opening_hour closing_hour raio_m operational_radius_km delivery_available dine_in_available pickup_available',
    geografia:'territory_id ibge_city_code city uf neighborhood district latitude longitude',
    microterritorios:'microterritory_id territory_id uf city ibge_city_code district neighborhood latitude longitude covered_delivery_stores customers net_brl',
    contexto_social:'territory_id population density_km2 income_per_capita_brl indicator_origin',
    mobilidade:'customer_id home_territory_id work_territory_id study_territory_id sport_territory_id usual_leisure_territory_id',
    campanhas:'campaign_id start_date end_date redemptions discount_brl',
    exposicoes:'campaign_id customer_id arm assignment_date', pesquisas:'survey_id customer_id survey_date',
    pedidos:'transaction_id customer_id store_id date time weekday sale_channel gross_brl discount_brl net_brl total_items cogs_brl campaign_id order_origin_territory_id commercial_territory_id delivery_destination_territory_id home_to_store_straight_km',
    itens:'transaction_item_id transaction_id product_id quantity unit_price_brl unit_cost_brl discount_brl net_brl margin_brl addon_product_id parent_transaction_item_id',
    operacao:'store_id date open_hours completed_transactions items_sold gross_revenue_brl net_revenue_brl cogs_brl staff_cost_brl operating_expenses_brl operating_result_brl marketing_investment_brl',
    disponibilidade:'store_id product_id week_start week_end available_days unit_price_brl unit_cost_brl units_sold',
    custos:'store_id date rent_brl fixed_overhead_brl variable_overhead_brl staff_cost_brl payment_fee_brl delivery_commission_brl waste_cost_brl cogs_brl marketing_investment_brl',
    financeiro:'store_id month completed_transactions items_sold gross_revenue_brl net_revenue_brl cogs_brl staff_cost_brl operating_expenses_brl operating_result_brl marketing_investment_brl',
    recorrencia:'customer_id store_id purchase_count delivery_purchase_count',
    gabarito_cenarios:'id cenario regra resultado passou', gabarito_perfis:'customer_id dominant_profile lifecycle_driver',
    matriz_integracao:'funcionalidade tabelas campos regra_importacao', dicionario:'tabela campo tipo chave descricao'
  };
  const QUOTAS = {SP:19847,RJ:6382,MG:5126,PE:4237,CE:3584,BA:3173,DF:2491,PR:2164,SC:1938,RS:1692};
  const SP = {'São Paulo':6753,Campinas:4317,Santos:2651,Guarulhos:1946,Osasco:1483,Barueri:1079,
    'São José dos Campos':1006,'Ribeirão Preto':612};
  const DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const CHANNELS = ['Presencial','Retirada','Delivery'];
  const ACTUAL = ['completed_transactions','items_sold','gross_revenue_brl','net_revenue_brl','cogs_brl'];
  const FINANCE = ACTUAL.concat(['staff_cost_brl','operating_expenses_brl','operating_result_brl','marketing_investment_brl']);
  const F = {active:null, busy:false};

  function assert(ok, message) {
    if (!ok) throw new Error(message);
  }
  function blanks(x) { return x == null || x === ''; }
  function num(x) {
    assert(typeof x === 'number' && Number.isFinite(x), 'Número obrigatório ou inválido.');
    return x;
  }
  function cents(x) {
    const n = num(x) * 100;
    assert(Math.abs(n - Math.round(n)) < 0.001, 'Valor monetário com mais de dois decimais.');
    return Math.round(n);
  }
  function dayNumber(str) {
    assert(typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str), 'Data civil ISO inválida.');
    const timestamp = Date.parse(str + 'T00:00:00Z');
    assert(Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === str, 'Dia civil inválido.');
    return timestamp / DAY;
  }
  function id(s, pattern, length) {
    assert(typeof s === 'string' && pattern.test(s), 'Identificador inválido: ' + s);
    const k = Number(s.slice(1));
    assert(k > 0 && k < length, 'Identificador fora da tabela: ' + s);
    return k;
  }
  const clientId = (x,n) => id(x,/^C\d{6}$/,n);
  const orderId = (x,n) => id(x,/^T\d{7}$/,n);
  function unique(map, key, value) {
    assert(!blanks(key) && !map.has(key), 'Chave vazia ou duplicada: ' + key);
    map.set(key, value);
  }
  function found(map, key, optional) {
    if (optional && blanks(key)) return null;
    const v = map.get(key);
    assert(v !== undefined, 'Chave estrangeira inexistente: ' + key);
    return v;
  }
  function coords(row) {
    assert(num(row.latitude) >= -34 && row.latitude <= 6 && num(row.longitude) >= -74 && row.longitude <= -32,
      'Coordenada fora dos limites do universo brasileiro.');
  }
  const add = (map,key,value) => map.set(key,(map.get(key) || 0)+value);
  function matchCounts(map, expected) {
    return map.size === Object.keys(expected).length && Object.entries(expected).every(([k,v]) => map.get(k) === v);
  }

  /* As linhas da análise compartilham colunas de pedido e vínculos de catálogo.
     O formato mantém a interface usada pelo motor de transações, com um
     único índice por item e sem copiar os atributos de cliente em cada linha. */
  function compactItems(order, product, quantity, unitPrice, amount, facts) {
    const {clients, stores, days, hours, channels, ids, dates, customerIds, shopList, productList}=facts;
    const linkedProducts=productList.map(()=>Object.create(null));
    const linkedCustomers=customerIds.map(()=>Object.create(null));
    const productAt=i=>productList[product[i]];
    const customerAt=i=>clients[order[i]];
    const dateAt=i=>dates[days[order[i]]];

    class Item {
      constructor(index) { this.index=index; }
      get _pedidoIndice() { return order[this.index]; }
      get _pedido() { return ids[order[this.index]]; }
      get _cliente() { return customerIds[customerAt(this.index)]; }
      get _sku() { return productAt(this.index).sku; }
      get _nome() { return productAt(this.index).produto; }
      get _tamanho() { return productAt(this.index).tamanho; }
      get _catBruta() { return productAt(this.index).categoria; }
      get _data() { return dateAt(this.index).date; }
      get _mes() { return dateAt(this.index).month; }
      get _dow() { return dateAt(this.index).dow; }
      get _hora() { return hours[order[this.index]]; }
      get _qtd() { return quantity[this.index]; }
      get _valorUnit() { return unitPrice[this.index]/100; }
      get _valor() { return amount[this.index]/100; }
      get _canal() { return CHANNELS[channels[order[this.index]]]; }
      get _unidade() { return shopList[stores[order[this.index]]].name; }
      get _unidadeId() { return shopList[stores[order[this.index]]].store_id; }
    }
    function linkedProperties(keys, linkAt) {
      for(const key of keys) Object.defineProperty(Item.prototype,key,{
        get(){return linkAt(this.index)[key] ?? null;},
        set(value){linkAt(this.index)[key]=value;}
      });
    }
    linkedProperties(['_prod','_cat','_subcat','_metodo'], i=>linkedProducts[product[i]]);
    linkedProperties(['_faixa','_genero','_uf','_cidade','_idade'], i=>linkedCustomers[customerAt(i)]);
    const items=new Array(order.length);
    for(let i=0;i<items.length;i++)items[i]=new Item(i);
    return items;
  }

  async function manifest(book) {
    assert(book.names.includes('metadados'), 'Selecione a planilha SMOOV_INTELLIGENCE_FULL_DATASET.xlsx.');
    const info = new Map(), manifest = new Map(), declared = new Set(['metadados']);
    let n = 0, total = 0;
    for await (const row of book.rows('metadados')) {
      if (!n++) {
        assert(row.join('|') === 'tipo|chave|valor|aba|linhas|colunas', 'Cabeçalho de metadados inválido.');
        continue;
      }
      const [type,key,value,sheet,rows,width] = row;
      if (type === 'info') {
        unique(info,key,value);
        continue;
      }
      assert(type === 'tabela' && Object.hasOwn(TABLES,key) && !declared.has(sheet) && book.names.includes(sheet)
        && (sheet === key || new RegExp('^'+key+'_\\d{2}$').test(sheet)) &&
        Number.isInteger(rows) && rows >= 0 && rows <= 1_048_575 && Number.isInteger(width) && width > 0 && width <= 128,
        'Aba, entidade ou contagem inválida no manifesto: ' + sheet);
      if (!manifest.has(key)) manifest.set(key,[]);
      manifest.get(key).push({sheet,rows,width});
      declared.add(sheet);
      total += rows;
    }
    assert(info.get('formato') === 'smoov-full-v1' && info.get('natureza') === 'SIMULADO' &&
      /^SMOOV-SIM-\d+-(full|qa)$/.test(info.get('lote')), 'O arquivo não é um lote sintético compatível.');
    assert(declared.size === book.names.length && manifest.size === Object.keys(TABLES).length, 'Há abas ausentes ou não declaradas.');
    for (const [key, specs] of manifest) {
      assert(specs.length === 1 ? specs[0].sheet === key :
        specs.every((spec,i) => spec.sheet === key + '_' + String(i+1).padStart(2,'0')), 'Partições fora de ordem: ' + key);
    }
    assert(total < 4_000_000, 'O lote excede 4 milhões de linhas.');
    return {manifest,info,total,names:book.names};
  }

  function reader(book, metadata, notify) {
    let done = 0;
    const counts = {}, headers = {};
    async function scan(name, setup) {
      let all = 0;
      for (const {sheet,rows,width} of metadata.manifest.get(name)) {
        let rowNumber = 0, handle, keys;
        for await (const batch of book.rowBatches(sheet)) for (const raw of batch) {
          rowNumber++;
          try {
            if (rowNumber === 1) {
              keys = raw;
              const known = new Set(keys);
              assert(keys.length === width && known.size === width &&
                keys.every(k => typeof k === 'string' && /^[a-z][a-z0-9_]*$/.test(k)) &&
                TABLES[name].split(' ').every(k => known.has(k)), 'Cabeçalho ausente ou incompatível.');
              if (headers[name]) assert(headers[name].join('|') === keys.join('|'), 'Cabeçalhos diferentes entre partições.');
              else headers[name] = keys;
              handle = setup(Object.fromEntries(keys.map((k,i)=>[k,i])), keys);
            } else {
              assert(raw.length <= width && rowNumber <= rows + 1, 'Linha ou coluna extra.');
              handle(raw, ++all);
              if ((++done & 8191) === 0) {
                notify({fraction:done/metadata.total,sheet,done,total:metadata.total});
                await new Promise(r => setTimeout(r,0));
              }
            }
          } catch (error) {
            throw new Error(sheet + ', linha ' + rowNumber + ' — ' + error.message, {cause:error});
          }
        }
        assert(rowNumber === rows + 1, 'Contagem diferente do manifesto: ' + sheet);
        counts[sheet] = rows;
        notify({fraction:done/metadata.total,sheet,done,total:metadata.total});
      }
      return all;
    }
    return {
      scan,counts,headers,
      size:name=>metadata.manifest.get(name).reduce((n,s)=>n+s.rows,0),
      async objects(name, consumer) {
        const list = [];
        await scan(name, (_, keys) => (raw,n) => {
          const row = {};
          for (let i=0; i<keys.length; i++) {
            const value=raw[i] ?? '';
            // Os textos de cadastro vivem além do bloco XML que os contém.
            // Desata o vínculo entre a substring e o bloco descompactado.
            row[keys[i]]=name==='clientes' && typeof value==='string' && value.length>12 ? (' '+value).slice(1) : value;
          }
          if (consumer) consumer(row,n);
          else list.push(row);
        });
        return list;
      }
    };
  }

  function calendar(meta) {
    const begin = dayNumber(meta.info.get('inicio'));
    const end = dayNumber(meta.info.get('fim'));
    assert(end-begin+1 >= 730 && end-begin+1 <= 732, 'O período do lote precisa cobrir 24 meses completos.');
    const dates = [], byISO = new Map(), byMonth = new Map();
    for (let day = begin; day <= end; day++) {
      const iso = new Date(day*DAY).toISOString().slice(0,10);
      const date = MI.parseDate(iso);
      const month = iso.slice(0,7);
      if (!byMonth.has(month)) byMonth.set(month,byMonth.size);
      byISO.set(iso,dates.length);
      dates.push({date,month,dow:date.getDay(),iso,monthIndex:byMonth.get(month)});
    }
    assert(byMonth.size === 24 && dates[0].iso.endsWith('-01') && new Date((end+1)*DAY).getUTCDate() === 1,
      'O período deve começar no primeiro dia de um mês e terminar no último.');
    return {dates,byISO,byMonth,offset:begin};
  }

  async function masters(r, period, isFull) {
    const geo=new Map(), micros=new Map(), stores=new Map(), products=new Map(), camps=new Map();
    const ufs=new Map(), cities=new Map(), sp=new Map();
    await r.objects('geografia', row => {
      coords(row);
      assert(Object.hasOwn(QUOTAS,row.uf) && /^\d{7}$/.test(String(row.ibge_city_code)), 'UF ou código IBGE inválido.');
      unique(geo,row.territory_id,row);
    });
    await r.objects('microterritorios', row => {
      coords(row);
      const g = found(geo,row.territory_id);
      assert(row.ibge_city_code === g.ibge_city_code && row.city===g.city && row.uf===g.uf, 'O microterritório diverge do município.');
      unique(micros,row.microterritory_id,row);
    });
    await r.objects('lojas', (row,n) => {
      coords(row);
      const g = found(geo,row.territory_id);
      assert(typeof row.name === 'string' && row.name.includes('Simulada') && row.city===g.city && row.uf===g.uf &&
        row.ibge_city_code===g.ibge_city_code && num(row.raio_m)>0 && num(row.opening_hour)>=0 &&
        num(row.closing_hour)<=24 && row.opening_hour<row.closing_hour, 'Loja inválida ou sem identificação sintética.');
      row.index=n-1;
      row.openDay=dayNumber(row.opening_date)-period.offset;
      unique(stores,row.store_id,row);
    });
    const rawCatalog=await r.objects('catalogo');
    rawCatalog.forEach((row,i) => {
      assert(row.produto && row.categoria && row.tamanho && cents(row.preco)>0,'Cadastro de SKU incompleto.');
      row.index=i;
      row.launchDay=dayNumber(row.launch_date)-period.offset;
      unique(products,row.sku,row);
    });
    await r.objects('campanhas', (row,n) => {
      row.index=n-1;
      row.start=found(period.byISO,row.start_date);
      row.end=found(period.byISO,row.end_date);
      assert(row.start<=row.end,'Período de campanha inválido.');
      unique(camps,row.campaign_id,row);
    });
    const cust = [null];
    await r.objects('clientes', (row,n) => {
      assert(clientId(row.cliente_id,r.size('clientes')+1)===n,'Cliente duplicado ou fora da sequência canônica.');
      const g=found(geo,row.home_territory_id), m=found(micros,row.home_microterritory_id);
      assert(row.uf===g.uf && row.cidade===g.city && row.bairro===g.neighborhood && (blanks(row.distrito) || row.distrito===g.district) &&
        row.ibge_city_code===g.ibge_city_code && m.territory_id===g.territory_id &&
        row.latitude===m.latitude && row.longitude===m.longitude,'Cadastro geográfico divergente.');
      if (blanks(row.distrito)) row.distrito=g.district;
      add(ufs,row.uf,1);
      add(cities,row.ibge_city_code,1);
      if(row.uf==='SP') add(sp,row.cidade,1);
      assert(num(row.idade)>=18 && row.idade<=85 && row.is_synthetic===true,'Cadastro inválido ou informação não sintética.');
      found(stores,row.loja_preferida_id);
      found(products,row.sku_preferido);
      cust.push(row);
    });
    assert(stores.size === 43 && products.size === 42 && cities.size >= 30 && micros.size >= 400 && ufs.size===10,
      'O lote ficou abaixo da escala do contrato.');
    if (isFull) assert(cust.length===50635 && matchCounts(ufs,QUOTAS) && matchCounts(sp,SP),
      'Quantidade de clientes ou cotas territoriais divergentes.');
    return {geo,micros,stores,products,camps,rawCatalog,cust,ufs,cities};
  }

  function compareRows(a,b,fields) {
    return fields.every((key,i) => (key.endsWith('_brl') ? cents(b[key]) : num(b[key]))===a[i]);
  }
  function intColumns(width,size) {
    return Array.from({length:width},()=>new Int32Array(size));
  }
  function program(m,period,r) {
    const size=r.size('pedidos')+1, lines=r.size('itens');
    const dailySize=period.dates.length*m.stores.size;
    // Centavos nacionais podem exceder 2^31; totais por pedido, pessoa ou loja/dia ficam abaixo dele.
    const [client,store,day,gross,discount,net,units,cogs] = intColumns(8,size);
    const hour=new Uint8Array(size), channel=new Uint8Array(size), ids=new Array(size);
    const [seenGross,seenDiscount,seenNet,seenUnits,seenCogs]=intColumns(5,size);
    const addon=new Uint8Array(size), soldAddon=new Uint8Array(size);
    const [cnt,customerNet,first,last]=intColumns(4,m.cust.length);
    first.fill(9999);
    const registration = m.cust.map(c=>c ? dayNumber(c.data_cadastro)-period.offset : 0);
    const daily=intColumns(ACTUAL.length,dailySize);
    const orderDayHour=new Int8Array(dailySize);
    orderDayHour.fill(-1);
    const shopList=Array.from(m.stores.values()), productList=Array.from(m.products.values());
    const weekCount=Math.ceil(period.dates.length/7);
    const stockSize=weekCount*m.stores.size*m.products.size;
    const [stockPrice,stockCost,reportedUnits,actualUnits]=intColumns(4,stockSize);
    const stockSeen=new Uint8Array(stockSize);
    const compactStore=(c,s)=>c*m.stores.size+s, recurrence=intColumns(2,m.cust.length*m.stores.size);
    const stockKey=(d,s,p)=>(Math.floor(d/7)*m.stores.size+s)*m.products.size+p;
    const [lineOrder,lineQuantity,lineUnitPrice,lineNet]=intColumns(4,lines);
    const lineProduct=new Uint8Array(lines);
    const campaignCount=Array.from({length:m.camps.size},()=>[0,0]);
    const totals={orders:size-1,items:lines,units:0,netCents:0,cogsCents:0,grossCents:0,discountCents:0,
      withoutDelivery:0, longDistanceOrders:0};
    const monthKeys=period.byMonth.size, monthTotal=Array.from({length:m.stores.size*monthKeys},()=>Array(FINANCE.length).fill(0));
    const docs={};

    async function stock() {
      await r.objects('disponibilidade', row => {
        const d=found(period.byISO,row.week_start), p=found(m.products,row.product_id), s=found(m.stores,row.store_id);
        const key=stockKey(d,s.index,p.index);
        assert(d%7===0 && !stockSeen[key] && found(period.byISO,row.week_end)===Math.min(d+6,period.dates.length-1),
          'Semana de estoque duplicada ou inválida.');
        stockSeen[key]=1;
        stockPrice[key]=cents(row.unit_price_brl);
        stockCost[key]=cents(row.unit_cost_brl);
        reportedUnits[key]=num(row.units_sold);
        assert(row.available_days > 0 || row.units_sold===0,'SKU vendido em semana sem disponibilidade.');
      });
      assert(stockSeen.every(x=>x===1),'A matriz semanal de disponibilidade está incompleta.');
    }

    async function orders() {
      const dailyHours=new Uint8Array(dailySize);
      for(const [i,row] of m.cust.entries()) if(i) {
        found(period.byISO,row.data_primeira_compra);
        found(period.byISO,row.data_ultima_compra);
      }
      await r.scan('pedidos', h => (row,n) => {
        const oid=orderId(row[h.transaction_id],size);
        assert(oid===n,'Pedido repetido ou fora de ordem.');
        const c=clientId(row[h.customer_id],m.cust.length);
        const s=found(m.stores,row[h.store_id]);
        const d=found(period.byISO,row[h.date]);
        const hh=row[h.time];
        assert(typeof hh==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(hh),'Hora local inválida.');
        const hr=Number(hh.slice(0,2));
        const ch=CHANNELS.indexOf(row[h.sale_channel]);
        assert(d>=registration[c] && d>=s.openDay && (row[h.weekday]===DAYS[period.dates[d].dow]) &&
          hr>=s.opening_hour && hr<s.closing_hour && ch>=0,'Dia, hora, estabelecimento ou canal incompatível.');
        assert(ch!==0 || s.dine_in_available,'Pedido presencial sem atendimento presencial.');
        assert(ch!==1 || s.pickup_available,'Pedido de retirada em loja sem retirada.');
        const origin=found(m.geo,row[h.order_origin_territory_id]);
        const home=found(m.geo,m.cust[c].home_territory_id);
        const distance=num(row[h.home_to_store_straight_km]);
        assert(distance>=0 && origin.uf===s.uf && row[h.commercial_territory_id]===s.territory_id,
          'Pedido com território, distância ou destino comercial inválido.');
        if (ch===2) assert(s.delivery_available && distance <= s.operational_radius_km + .001 &&
          home.territory_id===row[h.delivery_destination_territory_id],'Entrega fora da cobertura simulada.');
        else assert(blanks(row[h.delivery_destination_territory_id]),'Destino de entrega em pedido que não foi entregue.');
        const a=cents(row[h.gross_brl]), v=cents(row[h.net_brl]), disc=cents(row[h.discount_brl]), cost=cents(row[h.cogs_brl]);
        const q=num(row[h.total_items]);
        assert(Number.isInteger(q) && q>0 && a===v+disc && v>=0 && disc>=0 && cost>=0,'Valores inválidos no pedido.');
        const campaign=found(m.camps,row[h.campaign_id],true);
        if(campaign) {
          assert(d>=campaign.start && d<=campaign.end,'Pedido fora da janela da campanha.');
          campaignCount[campaign.index][0]++;
          campaignCount[campaign.index][1]+=disc;
        } else assert(disc===0,'Desconto sem campanha.');
        client[n]=c; store[n]=s.index; day[n]=d; hour[n]=hr; channel[n]=ch; ids[n]='T'+String(n).padStart(7,'0');
        gross[n]=a; discount[n]=disc; net[n]=v; units[n]=q; cogs[n]=cost;
        cnt[c]++; customerNet[c]+=v; first[c]=Math.min(first[c],d); last[c]=Math.max(last[c],d);
        const compact=d*m.stores.size+s.index;
        daily[0][compact]++; daily[1][compact]+=q; daily[2][compact]+=a; daily[3][compact]+=v; daily[4][compact]+=cost;
        dailyHours[compact]=1;
        const relation=compactStore(c,s.index);
        recurrence[0][relation]++;
        if(ch===2) recurrence[1][relation]++;
        else totals.withoutDelivery++;
        if(distance>8) totals.longDistanceOrders++;
        totals.netCents+=v; totals.grossCents+=a; totals.discountCents+=disc; totals.cogsCents+=cost; totals.units+=q;
      });
      dailyHours.forEach((x,i)=>{if(x) orderDayHour[i]=1;});
      m.cust.forEach((c,i)=>{
        if(!i)return;
        assert(cnt[i]===c.compras && customerNet[i]===cents(c.receita) &&
          Math.abs(Math.round(customerNet[i]/cnt[i])-cents(c.ticket))<=1 &&
          period.dates[first[i]].iso===c.data_primeira_compra && period.dates[last[i]].iso===c.data_ultima_compra &&
          period.dates.length-1-last[i]===c.recencia_dias,'Métricas do cliente não reconciliadas: '+c.cliente_id);
      });
      for(const c of m.camps.values()) assert(campaignCount[c.index][0]===c.redemptions &&
        campaignCount[c.index][1]===cents(c.discount_brl),'Métricas de campanha não reconciliadas.');
    }

    async function lineItems() {
      await r.scan('itens', h => (row,n) => {
        assert(id(row[h.transaction_item_id],/^I\d{7}$/,lines+1)===n,'Item repetido ou fora da sequência.');
        const o=orderId(row[h.transaction_id],size), p=found(m.products,row[h.product_id]);
        const q=num(row[h.quantity]), unit=cents(row[h.unit_price_brl]), cost=cents(row[h.unit_cost_brl]);
        const v=cents(row[h.net_brl]), disc=cents(row[h.discount_brl]);
        const d=day[o], s=store[o], sk=stockKey(d,s,p.index);
        assert(Number.isInteger(q) && q>0 && d>=p.launchDay && unit===stockPrice[sk] && cost===stockCost[sk] &&
          v>=0 && disc>=0 && unit*q===v+disc && cents(row[h.margin_brl])===v-cost*q,'Preço, margem ou estoque inválido.');
        if (!blanks(row[h.addon_product_id])) {
          assert(n===o,'Adicional vinculado a uma linha que não é principal.');
          addon[o]=found(m.products,row[h.addon_product_id]).index+1;
        }
        if (!blanks(row[h.parent_transaction_item_id])) {
          assert(p.categoria==='Adicionais' && id(row[h.parent_transaction_item_id],/^I\d{7}$/,lines+1)===o &&
            soldAddon[o]===0,'Linha de adicional ou pai do adicional inválidos.');
          soldAddon[o]=p.index+1;
        }
        seenGross[o]+=unit*q; seenDiscount[o]+=disc; seenNet[o]+=v; seenUnits[o]+=q; seenCogs[o]+=cost*q;
        actualUnits[sk]+=q;
        lineOrder[n-1]=o;
        lineProduct[n-1]=p.index;
        lineQuantity[n-1]=q;
        lineUnitPrice[n-1]=unit;
        lineNet[n-1]=v;
      });
      for(let k=1;k<size;k++) assert(gross[k]===seenGross[k] && discount[k]===seenDiscount[k] &&
        net[k]===seenNet[k] && units[k]===seenUnits[k] && cogs[k]===seenCogs[k] && addon[k]===soldAddon[k],
        'Os itens não reconciliam com o pedido '+ids[k]);
      assert(actualUnits.every((x,i)=>x===reportedUnits[i]),'Estoque e total de unidades vendidos divergem.');
    }

    async function operations() {
      const op=new Map(), costSeen=new Set(), finSeen=new Set();
      await r.objects('operacao', row=>{
        const d=found(period.byISO,row.date), s=found(m.stores,row.store_id);
        const key=d*m.stores.size+s.index;
        unique(op,key,row);
        assert(compareRows(daily.map(col=>col[key]),row,ACTUAL) &&
          cents(row.operating_result_brl)===cents(row.net_revenue_brl)-cents(row.cogs_brl)-
            cents(row.staff_cost_brl)-cents(row.operating_expenses_brl) &&
          (orderDayHour[key]!==1 || num(row.open_hours)>0),'Operação, funcionamento ou totais de vendas divergentes.');
        const mth=monthTotal[s.index*monthKeys+period.dates[d].monthIndex];
        FINANCE.forEach((field,i)=>{mth[i]+=field.endsWith('_brl') ? cents(row[field]) : num(row[field]);});
      });
      assert(op.size===dailySize,'Faltam dias no desempenho por loja.');
      await r.objects('custos', row=>{
        const s=found(m.stores,row.store_id), d=found(period.byISO,row.date), key=d*m.stores.size+s.index;
        const a=found(op,key);
        assert(!costSeen.has(key) && cents(row.cogs_brl)===cents(a.cogs_brl) &&
          cents(row.staff_cost_brl)===cents(a.staff_cost_brl) && cents(row.marketing_investment_brl)===cents(a.marketing_investment_brl) &&
          ['rent_brl','fixed_overhead_brl','variable_overhead_brl','payment_fee_brl','delivery_commission_brl','waste_cost_brl',
            'marketing_investment_brl'].reduce((n,k)=>n+cents(row[k]),0)===cents(a.operating_expenses_brl),
          'Custos e despesas diárias não reconciliados.');
        costSeen.add(key);
      });
      assert(costSeen.size===dailySize,'Faltam dias no livro de custos.');
      const monthly=[];
      await r.objects('financeiro', row=>{
        const s=found(m.stores,row.store_id), month=found(period.byMonth,row.month), key=s.index*monthKeys+month;
        assert(!finSeen.has(key) && compareRows(monthTotal[key],row,FINANCE),'Consolidação mensal divergente.');
        finSeen.add(key);
        monthly.push(row);
      });
      assert(finSeen.size===monthTotal.length,'Faltam totais mensais.');
      docs.financeiro=monthly;
    }

    async function companion() {
      const pairs=new Set();
      await r.objects('recorrencia', row=>{
        const c=clientId(row.customer_id,m.cust.length), s=found(m.stores,row.store_id);
        const key=compactStore(c,s.index);
        assert(!pairs.has(key) && row.purchase_count>0 && row.purchase_count===recurrence[0][key] &&
          row.delivery_purchase_count===recurrence[1][key],'Recorrência do par cliente × loja divergente.');
        pairs.add(key);
      });
      assert(recurrence[0].every((n,i)=>!n || pairs.has(i)),'Falta uma ligação de recorrência.');
      const mobility=new Set();
      await r.objects('mobilidade', row=>{
        const i=clientId(row.customer_id,m.cust.length);
        assert(!mobility.has(i) && row.home_territory_id===m.cust[i].home_territory_id,'Cadastro de mobilidade conflitante.');
        for(const key of ['work_territory_id','study_territory_id','sport_territory_id','usual_leisure_territory_id']) found(m.geo,row[key],true);
        mobility.add(i);
      });
      assert(mobility.size===m.cust.length-1,'Faltam regiões de mobilidade de clientes.');
      const social=new Set();
      await r.objects('contexto_social', row=>{
        found(m.geo,row.territory_id);
        assert(!social.has(row.territory_id) && num(row.population)>0 && row.indicator_origin==='Simulado','Contexto social inválido.');
        social.add(row.territory_id);
      });
      assert(social.size===m.geo.size,'Faltam territórios socioeconômicos.');
      const polls=new Set(), exposures=new Set();
      await r.objects('pesquisas', row=>{
        clientId(row.customer_id,m.cust.length);
        found(period.byISO,row.survey_date);
        assert(!polls.has(row.survey_id) && row.survey_id,'Pesquisa duplicada.');
        polls.add(row.survey_id);
      });
      await r.objects('exposicoes', row=>{
        clientId(row.customer_id,m.cust.length);
        const c=found(m.camps,row.campaign_id);
        const date=found(period.byISO,row.assignment_date), key=row.campaign_id+'|'+row.customer_id;
        assert(!exposures.has(key) && date>=c.start && date<=c.end && ['Tratamento','Controle'].includes(row.arm),
          'Exposição inválida ou duplicada.');
        exposures.add(key);
      });
      // As respostas do gabarito são lidas para verificar o pacote e descartadas.
      await r.scan('gabarito_perfis', () => () => {});
      await r.scan('gabarito_cenarios', () => () => {});
      docs.matriz_integracao=await r.objects('matriz_integracao');
      docs.dicionario=await r.objects('dicionario');
    }

    function items() {
      return compactItems(lineOrder,lineProduct,lineQuantity,lineUnitPrice,lineNet,{
        clients:client,stores:store,days:day,hours:hour,channels:channel,ids,dates:period.dates,
        customerIds:m.cust.map(c=>c?.cliente_id || null),shopList,productList
      });
    }
    return {stock,orders,lineItems,operations,companion,items,totals,docs};
  }

  F.canImport = function () {
    const auth = MI.auth;
    return MI.store.perspective==='smoov' && (!auth?.perfilTravado() || auth.role==='smoov_admin');
  };
  const lotesPadrao = new WeakSet();
  const podeAbrirPadrao = () => !!(MI.auth?.autenticado() && MI.auth.org?.id);
  async function preparar(file, onProgress) {
    assert(!F.active && !F.busy,'Desative o lote atual antes de carregar outro.');
    F.busy=true;
    try {
      const book=await MI.fullWorkbook.open(file), meta=await manifest(book);
      const r=reader(book,meta,onProgress || (()=>{})), period=calendar(meta);
      const full=meta.info.get('perfil')==='full';
      assert(full || meta.info.get('perfil')==='qa','Perfil de lote desconhecido.');
      if(full) assert(r.size('pedidos')>=725000 && r.size('pedidos')<=750000,'Quantidade de pedidos fora do contrato.');
      const m=await masters(r,period,full), p=program(m,period,r);
      await p.stock();
      await p.orders();
      await p.lineItems();
      await p.operations();
      await p.companion();
      assert(Object.keys(r.counts).length===book.names.length-1,'A leitura não verificou todas as abas.');
      if(full) assert(p.totals.units>=1200000 && p.totals.units<=1800000,'Unidades comercializadas fora do contrato.');
      onProgress?.({fraction:1, phase:'Preparando clientes e catálogo…'});
      await new Promise(resolve=>setTimeout(resolve,0));
      const customers=MI.importer.buildDataset({headers:r.headers.clientes,rows:m.cust.slice(1),headerRow:1},
        {name:'SMOOV Nacional · lote simulado',fileName:file.name,sheetName:'clientes'});
      customers.source=SOURCE;
      Object.assign(customers.roles,{
        id:'cliente_id',idade:'idade',nascimento:'nascimento',genero:'genero',uf:'uf',cidade:'cidade',bairro:'bairro',
        dataCadastro:'data_cadastro',dataEvento:'data_ultima_compra',recencia:'recencia_dias',frequencia:'compras',
        valor:'ticket',receita:'receita',hora:'hora',diaSemana:'dia_semana',plano:'plano',canal:'canal',status:'status'
      });
      const rolesByField=Object.fromEntries(Object.entries(customers.roles).map(([role,field])=>[field,role]));
      customers.columns.forEach(c=>{c.role=rolesByField[c.key] || null;});
      const catalog=MI.catalog.construirDeLinhas(m.rawCatalog,MI.catalog.inferirMapeamento(r.headers.catalogo),file.name);
      assert(catalog.length===m.products.size && customers.roles.id==='cliente_id' && customers.roles.uf==='uf' &&
        customers.roles.cidade==='cidade' && customers.roles.bairro==='bairro','O mapeamento nativo de clientes ou produtos divergiu.');
      const units=Array.from(m.stores.values(),s=>({
        id:s.store_id,nome:s.name,chave:MI.unidades.chaveDe(s.name),formato:s.ownership==='Própria'?'propria':'franquia',
        municipio:s.city,uf:s.uf,bairro:s.neighborhood,latitude:s.latitude,longitude:s.longitude,
        lat:s.latitude,lng:s.longitude,raio_m:s.raio_m,precisao:'exata',origem:SOURCE,formato_comercial:s.commercial_format,
        endereco:s.simulated_address || null,ibge_city_code:s.ibge_city_code,
        delivery_available:s.delivery_available,operational_status:s.operational_status,
        opening_hour:s.opening_hour,closing_hour:s.closing_hour,
        production_capacity_items_hour:s.production_capacity_items_hour,
        service_capacity_orders_hour:s.service_capacity_orders_hour,
        inaugurada_em:s.opening_date,is_synthetic:true
      }));
      return {id:meta.info.get('lote'),file,book,meta,customers,catalog,items:p.items(),units,docs:p.docs,
        geo:Array.from(m.geo.values()),micros:Array.from(m.micros.values()),
        counts:{metadados:book.names.length-1+6,...r.counts},stats:{...p.totals,
          customers:customers.rows.length,products:catalog.length,stores:units.length,cities:m.cities.size,
          ufs:Object.fromEntries(m.ufs),territories:m.geo.size,microterritories:m.micros.size}};
    } finally {
      F.busy=false;
    }
  }
  F.prepare = async function (file, onProgress) {
    assert(F.canImport(),'Apenas a perspectiva Administrador Smoov pode ativar um lote.');
    return preparar(file, onProgress);
  };
  F.prepararPadrao = async function (file, onProgress) {
    assert(podeAbrirPadrao(), 'Entre na conta da Smoov para abrir a base padrão.');
    const batch = await preparar(file, onProgress);
    assert(batch.stats.customers===50634 && batch.stats.orders===738426 && batch.stats.stores===43,
      'A base padrão diverge do lote nacional homologado.');
    lotesPadrao.add(batch);
    return batch;
  };

  const CATALOG_STATE=['items','source','fileName','loadedAt'];
  const TX_STATE=['items','source','fileName','headers','columns','mapping','link','ultimaAbsorcao','_cacheRows','_cacheFiltered'];
  function fields(o, keys) { return Object.fromEntries(keys.map(k=>[k,o[k]])); }

  F.activate = function (batch) {
    assert((F.canImport() || (lotesPadrao.has(batch) && podeAbrirPadrao())) && !F.active,
      'A sessão mudou ou já existe um lote ativo.');
    const s=MI.store, c=MI.catalog, t=MI.tx, u=MI.unidades;
    batch.previous={
      store:fields(s,['dataset','rows','filters']), catalog:fields(c,CATALOG_STATE),
      tx:fields(t,TX_STATE), units:fields(u,['items','fonte','erro','carregado'])
    };
    F.active=batch;
    try {
      Object.assign(u,{items:batch.units,fonte:SOURCE,erro:null,carregado:true});
      Object.assign(c,{items:batch.catalog,source:SOURCE,fileName:batch.file.name,loadedAt:new Date()});
      c.reindex();
      s.setDataset(batch.customers);
      t.setItems(batch.items,SOURCE,batch.file.name,
        {idPedido:'transaction_id',idCliente:'customer_id',sku:'product_id',categoria:'categoria',data:'date',hora:'time'},
        {headers:['transaction_id','customer_id','product_id','date','time','quantity','net_brl'],columns:[]});
      assert(t.link.pedidos===batch.stats.orders && t.link.taxaProduto===1 && t.link.taxaCliente===1 &&
        t.link.taxaHora===1 && t.link.taxaData===1 && t.link.taxaValor===1,'O motor nativo não vinculou o lote inteiro.');
      c.emit();
    } catch (error) {
      F.remove();
      throw error;
    }
  };

  F.remove = function () {
    if(!F.active)return;
    const previous=F.active.previous;
    F.active=null;
    Object.assign(MI.catalog,previous.catalog);
    MI.catalog.reindex();
    Object.assign(MI.unidades,previous.units);
    Object.assign(MI.store,previous.store);
    Object.assign(MI.tx,previous.tx);
    MI.store.emit('dataset',MI.store.dataset);
    MI.tx.emit();
    MI.catalog.emit();
  };

  F.page = async function (name, skip, limit=25, filter) {
    const batch=F.active;
    assert(batch && F.canImport() && !name.startsWith('gabarito_') && batch.meta.manifest.has(name),'Tabela fora do lote ativo.');
    let fields=null, seen=0;
    const rows=[];
    for(const spec of batch.meta.manifest.get(name)) {
      if(!filter && seen+spec.rows<=skip) {seen+=spec.rows;continue;}
      let header=true;
      for await(const row of batch.book.rows(spec.sheet)) {
        if(header) {fields=row;header=false;continue;}
        if(filter && row[fields.indexOf(filter.field)]!==filter.value) continue;
        if(seen++>=skip) rows.push(row);
        if(rows.length>limit) return {fields,rows:rows.slice(0,limit),hasMore:true};
      }
    }
    return {fields:fields || [],rows,hasMore:false};
  };
  MI.fullData=F;
})(window.MI);
