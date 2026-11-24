/* Runs the repository's Excel parser and analytical modules in an isolated local VM. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

process.env.TZ = 'America/Sao_Paulo';
const [profileArg, sheetJsArg] = process.argv.slice(2);
if (!profileArg || !sheetJsArg) throw new Error('Uso: node tests/import_local.cjs <perfil> <xlsx.full.min.js>');
const profile = path.resolve(profileArg);
const repo = path.resolve(__dirname, '../..');
const relative = path.relative(repo, profile);
assert(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'A base deve ficar fora do app.');
const XLSX = require(path.resolve(sheetJsArg));
assert.equal(XLSX.version, '0.18.5');
const dataset = name => path.join(profile, 'datasets', name + '.xlsx');
const reports = path.join(profile, 'reports');
const validation = JSON.parse(fs.readFileSync(path.join(reports, 'validation_report.json'), 'utf8'));

class OfflineFileReader {
  readAsArrayBuffer(file) {
    try {
      const buf = fs.readFileSync(file.filePath);
      this.result = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      this.onprogress?.({ lengthComputable: true, loaded: buf.byteLength, total: buf.byteLength });
      this.onload?.();
    } catch (error) {
      this.error = error;
      this.onerror?.();
    }
  }
}

function runtime() {
  const context = vm.createContext({ XLSX, FileReader: OfflineFileReader, Date, TextDecoder, Uint8Array, setTimeout });
  context.window = context;
  const modules = ['core', 'data-cities', 'data-schema', 'data-store', 'data-stats', 'data-import',
    'data-catalog-smoov', 'data-catalog', 'data-transactions', 'data-txstats'];
  for (const name of modules) {
    const file = path.join(repo, 'assets/js', name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context.MI;
}

function read(MI, filePath) {
  return MI.importer.readFile({ name: path.basename(filePath), filePath, size: fs.statSync(filePath).size });
}

function cents(rows, field) {
  return rows.reduce((total, row) => total + Math.round(row[field] * 100), 0);
}

function loadCatalog(MI, src) {
  assert.equal(src.sheets[0].name,'catalogo','Cardápio lê a primeira aba do arquivo');
  const catalog = MI.importer.extractSheet(src, src.sheets[0].name);
  const mapping = MI.catalog.inferirMapeamento(catalog.headers);
  assert.equal(mapping.sku, 'sku');
  assert.equal(mapping.nome, 'produto');
  assert.equal(mapping.preco, 'preco');
  MI.catalog.items = MI.catalog.construirDeLinhas(catalog.rows, mapping, src.fileName);
  MI.catalog.reindex();
  return { received:catalog.rows.length, accepted:MI.catalog.items.length, rejected:catalog.rows.length-MI.catalog.items.length, mapping };
}

async function testGold() {
  const MI = runtime();
  const expected = validation.business;
  const start = performance.now();
  const src = await read(MI, dataset('smoov_import'));
  const parseMs = performance.now() - start;
  const customerSheet = MI.importer.pontuarAbas(src, ['cliente','customer','base','cadastro','consumidor','pessoa','contato']).recomendada;
  const txSheet = MI.importer.pontuarAbas(src, ['pedido','item','venda','transac','order','compra','cupom','consumo']).recomendada;
  assert.equal(customerSheet, 'clientes');
  assert.equal(txSheet, 'transacoes');
  const cust = MI.importer.extractSheet(src, customerSheet);
  const items = MI.importer.extractSheet(src, txSheet);
  const catalog = loadCatalog(MI, src);
  const roles = {
    id:'cliente_id', idade:'idade', nascimento:'nascimento', genero:'genero', uf:'uf', cidade:'cidade',
    bairro:'bairro', dataCadastro:'data_cadastro', dataEvento:'data_ultima_compra', recencia:'recencia_dias',
    frequencia:'compras', valor:'ticket', receita:'receita', hora:'hora', diaSemana:'dia_semana',
    canal:'canal', plano:'plano', status:'status',
  };
  const txFields = {
    idPedido:'pedido_id', idCliente:'cliente_id', sku:'sku', produto:'produto', tamanho:'tamanho',
    categoria:'categoria', data:'data_pedido', hora:'hora', quantidade:'quantidade', valorUnitario:'valor_unitario',
    valorTotal:'valor_total', canal:'canal', unidade:'unidade',
  };
  const ds = MI.importer.buildDataset(cust, { name:'SMOOV DEMO', fileName:src.fileName, sheetName:customerSheet });
  for (const [key,value] of Object.entries(roles)) assert.equal(ds.roles[key],value,'papel cliente ' + key);
  MI.store.setDataset(ds);
  const map = MI.tx.inferirMapeamento(items.headers);
  for (const [key,value] of Object.entries(txFields)) assert.equal(map[key],value,'campo transação ' + key);
  const quality = MI.importer.quality(ds);
  const link = MI.tx.importarDeLinhas(items.rows, items.headers, map, src.fileName);
  const purchaseStats = MI.txStats.porPedido(MI.tx.items);
  const rfm = MI.stats.rfm(ds.rows);
  assert.equal(ds.rows.length, expected.customers);
  assert.equal(new Set(ds.rows.map(r => r.cliente_id)).size, expected.customers);
  assert.equal(catalog.accepted, 42);
  assert.equal(link.itens, items.rows.length);
  assert.equal(link.pedidos, expected.orders);
  assert.equal(link.taxaProduto, 1);
  assert.equal(link.metodos.find(m => m.metodo === 'sku').n, link.itens);
  assert.equal(link.taxaCliente, 1);
  assert.equal(link.taxaData, 1);
  assert.equal(link.taxaHora, 1);
  assert.equal(link.taxaValor, 1);
  const net = Math.round(expected.net_brl * 100);
  assert.equal(cents(MI.tx.items,'_valor'), net);
  assert.equal(cents(ds.rows,'_receita'), net);
  assert.equal(ds.rows.reduce((total,r) => total + r._freq,0), expected.orders);
  assert.equal(Math.round(purchaseStats.ticketMedio * 100), Math.round(expected.ticket_brl * 100));
  assert.equal(rfm.total, expected.customers);
  const segments = Object.fromEntries(rfm.filter(r=>r.count>0).map(r=>[r.label,r.count]));
  assert.deepEqual(segments,expected.rf_segments);
  const orderUnique = new Map(MI.tx.items.map(r => [r._pedido,r._unidade]));
  const stores = {};
  for (const name of orderUnique.values()) stores[name] = (stores[name] || 0) + 1;
  assert.deepEqual(Object.values(stores).sort((a,b)=>a-b),
    Object.values(validation.checks.find(r=>r.check_id==='cotas_lojas').observed).sort((a,b)=>a-b));
  const reload = MI.tx.importarDeLinhas(items.rows,items.headers,map,src.fileName);
  assert.equal(reload.itens,link.itens);
  assert.equal(reload.pedidos,link.pedidos);
  assert.equal(reload.produtosCasados,link.produtosCasados);
  assert.equal(reload.clientesLigados,link.clientesLigados);
  assert.equal(cents(MI.tx.items,'_valor'),net);
  return {
    sheetjs_version:XLSX.version, elapsed_ms:Number((performance.now()-start).toFixed(1)), excel_parse_ms:Number(parseMs.toFixed(1)),
    customers:{ received:cust.rows.length, accepted:ds.rows.length, rejected:0, quality_score:quality.score, roles:ds.roles },
    items:{ received:items.rows.length, accepted:link.itens, rejected:0, mapping:map, linked_sku:link.produtosCasados,
      linked_customer:link.clientesLigados, orders:link.pedidos, revenue_brl:net/100, ticket_brl:purchaseStats.ticketMedio },
    catalog, rf_segments:segments, stores, idempotent_replacement:true,
  };
}

async function testFixtures() {
  const MI=runtime();
  const raw=await read(MI,dataset('smoov_raw_quality_tests'));
  const cust=MI.importer.extractSheet(raw,'clientes_raw',{headerRow:0});
  const tx=MI.importer.extractSheet(raw,'itens_raw',{headerRow:0});
  const incomplete=MI.importer.extractSheet(raw,'arquivo_incompleto',{headerRow:0});
  loadCatalog(MI,await read(MI,dataset('smoov_import')));
  const ds=MI.importer.buildDataset(cust,{name:'RAW, VM isolada',fileName:raw.fileName});
  MI.store.setDataset(ds);
  const quality=MI.importer.quality(ds);
  const link=MI.tx.importarDeLinhas(tx.rows,tx.headers,MI.tx.inferirMapeamento(tx.headers),raw.fileName);
  const badTotals=MI.tx.items.filter(r=>r._valor===99.99 || r._valor<0).length;
  const incompleteMap=MI.tx.inferirMapeamento(incomplete.headers);
  const incompleteBlocked=!incompleteMap.produto && !incompleteMap.sku;
  assert(cust.rows.length>=10);
  assert(tx.rows.length>=10);
  assert(link.semCliente>0);
  assert.equal(badTotals,2);
  assert.equal(incompleteBlocked,true);
  assert(MI.tx.items.some(r=>r._valor===16.99));
  const identity=await read(MI,dataset('smoov_identity_resolution_tests'));
  const identityRows=MI.importer.extractSheet(identity,'identity_records',{headerRow:0}).rows.length;
  const exceptions=await read(MI,dataset('smoov_transaction_exceptions'));
  const exRows=MI.importer.extractSheet(exceptions,'exception_orders',{headerRow:0}).rows.length;
  assert.equal(identityRows,16);
  assert.equal(exRows,9);
  return {status:'executado em VM separada',customers_received:cust.rows.length,
    items_received:tx.rows.length,items_accepted:link.itens,items_orphan_accepted:link.semCliente,
    invalid_financial_rows_accepted:badTotals,incomplete_layout_blocked_by_required_mapping:incompleteBlocked,
    quality_issues:quality.issues.map(i=>({nivel:i.level,coluna:i.col,titulo:i.titulo})),
    identity_fixture_rows_read:identityRows,exception_fixture_rows_read:exRows,
    identity_resolution:'sem motor nativo',exception_lifecycle_processing:'sem motor nativo'};
}

async function main() {
  const result={scope:'Arquivo local em VM descartável, sem sessão, IndexedDB, rede ou backend.',status:'PASS',
    platform_revision:require('node:child_process').execFileSync('git',['rev-parse','--short','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
    node_version:process.version,gold:await testGold(),fixtures:await testFixtures()};
  fs.writeFileSync(path.join(reports,'import_test.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,customers:result.gold.customers.accepted,orders:result.gold.items.orders,
    items:result.gold.items.accepted,revenue_brl:result.gold.items.revenue_brl,elapsed_ms:result.gold.elapsed_ms}));
}

main().catch(error=>{ console.error(error); process.exitCode=1; });
