/* 10 Move Intelligence — cobertura, sobreposição e demanda descoberta
   -------------------------------------------------------------------------
   Três coisas que costumam virar uma só, e não são:

     COBERTURA LOGÍSTICA   onde a loja CONSEGUE entregar. É uma regra
                           operacional da Smoov — 3 km por causa de produto
                           fresco — e não uma medição de nada.
     ÁREA DE CAPTAÇÃO      de onde o cliente EFETIVAMENTE vem. Quase sempre
                           maior e mais torta, porque gente compra no
                           caminho do trabalho. Exige saber a origem do
                           cliente; hoje não dá.
     DEMANDA DESCOBERTA    onde há cliente comprando e nenhum raio alcança.

   Este módulo calcula a primeira e a terceira, e NÃO finge calcular a
   segunda.

   Duas regras que mudam o número:

   1. Áreas sobrepostas não se somam. Duas lojas de 28 km² com 9 km² em
      comum cobrem 47 km², não 56. Somar seria inventar território.
   2. Região sem cobertura não é oportunidade automática. Pode ser lugar
      onde já se tentou. O módulo devolve o fato; a conclusão é de quem
      conhece a operação.

   A geometria é plana, em metros locais. Para raios de poucos quilômetros
   o erro é irrelevante; não serve para distância entre capitais.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const C = {};
  const R_TERRA = 6371000;
  const RAD = Math.PI / 180;

  /* Haversine: distância em metros entre dois pontos. */
  C.distancia = function (a, b) {
    const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
    const la1 = a[0] * RAD, la2 = b[0] * RAD;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  /* Área de interseção de dois círculos, em m². Fórmula clássica das duas
     calotas; devolve 0 quando não se tocam e a área do menor quando um
     contém o outro. */
  function areaLente(d, r1, r2) {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) { const r = Math.min(r1, r2); return Math.PI * r * r; }
    const a1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
    const a2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
    const a3 = 0.5 * Math.sqrt(Math.max(0,
      (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)));
    return a1 + a2 - a3;
  }
  C.areaLente = areaLente;

  /* Contorno da interseção, para desenhar. Dois arcos entre os pontos onde
     os círculos se cruzam, amostrados — nenhuma biblioteca de geometria
     entra no projeto por causa disto. */
  C.lente = function (p1, r1, p2, r2, passos) {
    const d = C.distancia(p1, p2);
    if (d >= r1 + r2 || d <= Math.abs(r1 - r2) || d === 0) return null;
    passos = passos || 36;

    /* plano local em metros, com a origem no primeiro centro */
    const mPorLat = 111320;
    const mPorLon = 111320 * Math.cos(p1[0] * RAD);
    const dx = (p2[1] - p1[1]) * mPorLon, dy = (p2[0] - p1[0]) * mPorLat;
    const ang = Math.atan2(dy, dx);

    /* distância do centro 1 até a corda, e meia-corda */
    const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const meioAng1 = Math.atan2(h, a);
    const b = (d * d + r2 * r2 - r1 * r1) / (2 * d);
    const meioAng2 = Math.atan2(h, b);

    const pontos = [];
    const empurra = function (centro, raio, de, ate, n) {
      for (let i = 0; i <= n; i++) {
        const t = de + (ate - de) * (i / n);
        const x = raio * Math.cos(t), y = raio * Math.sin(t);
        pontos.push([centro[0] + y / mPorLat, centro[1] + x / mPorLon]);
      }
    };
    empurra(p1, r1, ang - meioAng1, ang + meioAng1, passos);
    empurra(p2, r2, ang + Math.PI - meioAng2, ang + Math.PI + meioAng2, passos);
    return pontos;
  };

  /* ---------------- Análise ---------------- */

  /* Só unidade com coordenada entra. Posição aproximada pelo município não
     sustenta raio de 3 km, e incluí-la produziria sobreposição fictícia
     entre lojas que, no mapa, estão todas no mesmo centróide. */
  C.unidadesComCoordenada = function (filtro) {
    if (!MI.unidades || !MI.unidades.items) return [];
    return MI.unidades.items.filter(function (u) {
      if (u.precisao !== 'exata' || u.lat == null || u.lng == null) return false;
      return filtro ? filtro(u) : true;
    });
  };

  C.analisar = function (opts) {
    opts = opts || {};
    const unidades = C.unidadesComCoordenada(opts.filtro);
    const res = {
      unidades: unidades,
      comCoordenada: unidades.length,
      semCoordenada: MI.unidades && MI.unidades.items
        ? MI.unidades.items.filter(function (u) { return u.precisao !== 'exata'; }).length : 0,
      pares: [],
      areaTotal: 0,
      areaSobreposta: 0,
      disponivel: unidades.length > 0
    };
    if (!unidades.length) return res;

    /* Área coberta sem contar duas vezes. Com poucas unidades, subtrair as
       interseções par a par é exato o bastante; sobreposição tripla é rara
       numa rede de produto fresco, e quando houver ela é SUBTRAÍDA duas
       vezes — então o número sai conservador, nunca inflado. */
    let soma = 0;
    unidades.forEach(function (u) {
      const r = u.raio_m || 3000;
      soma += Math.PI * r * r;
    });

    for (let i = 0; i < unidades.length; i++) {
      for (let j = i + 1; j < unidades.length; j++) {
        const a = unidades[i], b = unidades[j];
        const pa = [a.lat, a.lng], pb = [b.lat, b.lng];
        const ra = a.raio_m || 3000, rb = b.raio_m || 3000;
        const d = C.distancia(pa, pb);
        if (d >= ra + rb) continue;
        const area = areaLente(d, ra, rb);
        res.pares.push({
          a: a, b: b, distancia: d, area: area,
          fracaoA: area / (Math.PI * ra * ra),
          fracaoB: area / (Math.PI * rb * rb),
          contorno: C.lente(pa, ra, pb, rb)
        });
        res.areaSobreposta += area;
      }
    }
    res.pares.sort(function (x, y) { return y.area - x.area; });
    res.areaTotal = Math.max(0, soma - res.areaSobreposta);
    res.areaBruta = soma;
    return res;
  };

  /* Municípios com cliente no recorte que nenhum raio alcança.
     ------------------------------------------------------------------
     A medida é do CENTRÓIDE do município até a loja mais próxima. Num
     município pequeno isso é razoável; em São Paulo capital o centróide
     está a dezenas de quilômetros das bordas, e o resultado diz pouco.
     Por isso a função devolve a distância junto: o número cru permite
     julgar se a leitura vale. */
  C.demandaDescoberta = function (rows, uf, limiteM) {
    if (!uf || !MI.geo.temUf(uf)) return null;
    const unidades = C.unidadesComCoordenada(function (u) { return u.uf === uf; });
    if (!unidades.length) return null;

    const porCidade = new Map();
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i]._cidade;
      if (!c) continue;
      porCidade.set(c, (porCidade.get(c) || 0) + 1);
    }

    const fora = [];
    let dentro = 0, semGeometria = 0;
    porCidade.forEach(function (n, nome) {
      const f = MI.geo.municipioPorNome(uf, nome);
      if (!f) { semGeometria += n; return; }
      const cx = f.properties.caixa;
      const centro = [(cx[0][0] + cx[1][0]) / 2, (cx[0][1] + cx[1][1]) / 2];
      let menor = Infinity, maisProxima = null;
      unidades.forEach(function (u) {
        const d = C.distancia(centro, [u.lat, u.lng]);
        if (d < menor) { menor = d; maisProxima = u; }
      });
      const limite = limiteM || (maisProxima && maisProxima.raio_m) || 3000;
      if (menor <= limite) dentro += n;
      else fora.push({ cidade: nome, clientes: n, distancia: menor, unidade: maisProxima });
    });
    fora.sort(function (a, b) { return b.clientes - a.clientes; });
    return {
      fora: fora, dentro: dentro, semGeometria: semGeometria,
      clientesFora: fora.reduce(function (s, e) { return s + e.clientes; }, 0)
    };
  };

  MI.cobertura = C;

})(window.MI);
