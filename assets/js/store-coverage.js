/* Operações de cobertura logística teórica. GeoJSON usa [longitude, latitude],
   e as entradas pontuais seguem a convenção do mapa: [latitude, longitude]. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const R_TERRA = 6371000;
  const RAD = Math.PI / 180;
  const PASSOS = 128;
  const RAIO_PADRAO = 3000;
  const RAIO_MIN = 100;
  const RAIO_MAX = 50000;
  const STATUS_INATIVOS = new Set([
    'inativa', 'inativo', 'fechada', 'fechado', 'encerrada', 'encerrado',
    'desativada', 'desativado', 'inoperante', 'planejada', 'planejado',
    'temporariamente fechada', 'temporariamente fechado',
    'inactive', 'closed', 'suspended', 'temporarily closed', 'planned'
  ]);

  function numero(valor) {
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'string' && valor.trim()) return Number(valor);
    return NaN;
  }

  function pontoValido(ponto) {
    if (!Array.isArray(ponto)) return null;
    const lat = numero(ponto[0]);
    const lng = numero(ponto[1]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }

  function coordenadas(unidade) {
    if (!unidade || (unidade.precisao && unidade.precisao !== 'exata')) return null;
    const ponto = pontoValido([unidade.lat ?? unidade.latitude, unidade.lng ?? unidade.longitude]);
    if (!ponto || ponto[0] < -34 || ponto[0] > 6 || ponto[1] < -74 || ponto[1] > -32) return null;
    return ponto;
  }

  function elegivel(unidade) {
    if (!unidade || unidade.delivery_available === false || unidade.ativo === false || unidade.is_active === false) return false;
    const status = String(unidade.status_operacional ?? unidade.operational_status ?? unidade.status ?? '')
      .trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    return !STATUS_INATIVOS.has(status);
  }

  function raio(unidade, raioM) {
    const ajuste = numero(raioM);
    const cadastrado = numero(unidade?.raio_m);
    if (ajuste > 0 && Number.isFinite(ajuste)) return Math.min(RAIO_MAX, Math.max(RAIO_MIN, ajuste));
    return cadastrado > 0 && Number.isFinite(cadastrado) ? cadastrado : RAIO_PADRAO;
  }

  function distancia(a, b) {
    const dLat = (b[0] - a[0]) * RAD;
    const dLng = (b[1] - a[1]) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R_TERRA * Math.asin(Math.sqrt(Math.min(1, h)));
  }

  function areaDisco(raioM) {
    return 4 * Math.PI * R_TERRA ** 2 * Math.sin(raioM / (2 * R_TERRA)) ** 2;
  }

  function poligonoDisco(ponto, raioM) {
    const latitude = ponto[0] * RAD;
    const longitude = ponto[1] * RAD;
    const angular = raioM / R_TERRA;
    const sinLat = Math.sin(latitude);
    const cosLat = Math.cos(latitude);
    const sinAngular = Math.sin(angular);
    const cosAngular = Math.cos(angular);
    const anel = [];
    for (let i = 0; i < PASSOS; i++) {
      const rumo = -2 * Math.PI * i / PASSOS;
      const lat = Math.asin(sinLat * cosAngular + cosLat * sinAngular * Math.cos(rumo));
      const lng = longitude + Math.atan2(Math.sin(rumo) * sinAngular * cosLat, cosAngular - sinLat * Math.sin(lat));
      anel.push([lng / RAD, lat / RAD]);
    }
    anel.push(anel[0]);
    return [anel];
  }

  function multiPoligono(geojson) {
    const geometria = geojson?.type === 'Feature' ? geojson.geometry : geojson;
    if (geometria?.type === 'Polygon' && geometria.coordinates?.length) return [geometria.coordinates];
    if (geometria?.type === 'MultiPolygon' && geometria.coordinates?.length) return geometria.coordinates;
    return [];
  }

  function feature(poligonos) {
    if (!poligonos.length) return null;
    const geometry = poligonos.length === 1
      ? { type: 'Polygon', coordinates: poligonos[0] }
      : { type: 'MultiPolygon', coordinates: poligonos };
    return { type: 'Feature', properties: {}, geometry };
  }

  /* Integral de sin(latitude) em cada segmento reto em longitude/latitude.
     A referência local cancela no anel fechado e evita perda de precisão. */
  function areaAnel(anel) {
    const referencia = Math.sin(anel[0][1] * RAD);
    let soma = 0;
    for (let i = 0; i < anel.length; i++) {
      const [lngA, latA] = anel[i];
      const [lngB, latB] = anel[(i + 1) % anel.length];
      const meioDelta = (latB - latA) * RAD / 2;
      const fator = meioDelta === 0 ? 1 : Math.sin(meioDelta) / meioDelta;
      soma += (lngB - lngA) * RAD * (Math.sin((latA + latB) * RAD / 2) * fator - referencia);
    }
    return Math.abs(soma) * R_TERRA ** 2;
  }

  function areaMulti(poligonos) {
    return poligonos.reduce(function (total, poligono) {
      const [externo, ...furos] = poligono;
      return total + (externo?.length ? Math.max(0, areaAnel(externo) - furos.reduce(
        (area, furo) => area + areaAnel(furo), 0
      )) : 0);
    }, 0);
  }

  function classe(analise, ponto) {
    const p = pontoValido(ponto);
    if (!p || !analise?.circulos?.length) return null;
    return analise.circulos.reduce(function (n, circulo) {
      if (Math.abs(p[0] - circulo.ponto[0]) > circulo.raioM / R_TERRA / RAD) return n;
      return n + (distancia(p, circulo.ponto) <= circulo.raioM ? 1 : 0);
    }, 0);
  }

  function rede(unidades, raioM) {
    const registros = unidades.map(unidade => ({ unidade, ponto: coordenadas(unidade) }));
    const comCoordenada = registros.filter(registro => registro.ponto).length;
    const operacionais = registros.filter(registro => elegivel(registro.unidade));
    const circulos = operacionais.filter(registro => registro.ponto).map(function (registro) {
      const r = raio(registro.unidade, raioM);
      return { ...registro, raioM: r, area: areaDisco(r), poligono: poligonoDisco(registro.ponto, r) };
    });
    const analise = {
      unidades: circulos.map(circulo => circulo.unidade), circulos,
      comCoordenada: circulos.length, totalGeorreferenciadas: comCoordenada,
      semCoordenada: registros.length - comCoordenada,
      semCoordenadaElegiveis: operacionais.length - circulos.length,
      foraDaCoberturaOperacional: registros.length - operacionais.length,
      pares: [], areaPorUnidade: new Map(circulos.map(circulo => [
        circulo.unidade.id ?? circulo.unidade.store_id ?? circulo.unidade.chave ?? circulo.unidade.nome,
        circulo.area
      ])),
      areaBruta: circulos.reduce((total, circulo) => total + circulo.area, 0),
      areaTotal: null, areaSobreposta: null, cobertura: null, sobreposicao: null,
      disponivel: false, erro: null
    };
    if (!circulos.length) return analise;

    try {
      const clip = window.polygonClipping;
      const uniao = clip.union(...circulos.map(circulo => circulo.poligono));
      const intersecoes = [];
      for (let i = 0; i < circulos.length; i++) {
        const a = circulos[i];
        for (let j = i + 1; j < circulos.length; j++) {
          const b = circulos[j];
          const d = distancia(a.ponto, b.ponto);
          if (d >= a.raioM + b.raioM) continue;
          const intersecao = clip.intersection(a.poligono, b.poligono);
          const areaComum = areaMulti(intersecao);
          if (!areaComum) continue;
          intersecoes.push(intersecao);
          analise.pares.push({
            a: a.unidade, b: b.unidade, distancia: d, area: areaComum,
            fracaoA: areaComum / a.area, fracaoB: areaComum / b.area,
            geometria: feature(intersecao)
          });
        }
      }
      const sobreposta = intersecoes.length ? clip.union(...intersecoes) : [];
      analise.cobertura = feature(uniao);
      analise.sobreposicao = feature(sobreposta);
      analise.areaTotal = areaMulti(uniao);
      analise.areaSobreposta = areaMulti(sobreposta);
      analise.pares.sort((a, b) => b.area - a.area);
      analise.disponivel = true;
    } catch (erro) {
      analise.pares = [];
      analise.erro = window.polygonClipping
        ? 'Não foi possível combinar as geometrias de cobertura.'
        : 'Biblioteca de operações geográficas indisponível.';
      console.error(analise.erro, erro);
    }
    return analise;
  }

  function recortar(analise, territorio) {
    const resultado = {
      ...analise, areaTerritorio: null, areaCobertaTerritorio: null, areaSobrepostaTerritorio: null,
      areaDescoberta: null, percentualTerritorial: null, coberturaNoTerritorio: null,
      sobreposicaoNoTerritorio: null, descoberta: null, erroTerritorio: null
    };
    if (!territorio) return resultado;
    try {
      const limite = multiPoligono(territorio);
      if (!limite.length) throw new Error('Território sem geometria poligonal.');
      resultado.areaTerritorio = areaMulti(limite);
      if (!analise.disponivel) return resultado;
      const clip = window.polygonClipping;
      const cobertura = multiPoligono(analise.cobertura);
      const sobreposicao = multiPoligono(analise.sobreposicao);
      const coberta = clip.intersection(limite, cobertura);
      const sobreposta = sobreposicao.length ? clip.intersection(limite, sobreposicao) : [];
      const descoberta = clip.difference(limite, cobertura);
      const areaCoberta = areaMulti(coberta);
      resultado.coberturaNoTerritorio = feature(coberta);
      resultado.sobreposicaoNoTerritorio = feature(sobreposta);
      resultado.descoberta = feature(descoberta);
      resultado.areaCobertaTerritorio = areaCoberta;
      resultado.areaSobrepostaTerritorio = areaMulti(sobreposta);
      resultado.areaDescoberta = areaMulti(descoberta);
      resultado.percentualTerritorial = resultado.areaTerritorio ? 100 * areaCoberta / resultado.areaTerritorio : null;
    } catch (erro) {
      resultado.erroTerritorio = 'Não foi possível calcular a cobertura no limite selecionado.';
      console.error(resultado.erroTerritorio, erro);
    }
    return resultado;
  }

  function analisar(unidades, opcoes) {
    return recortar(rede(unidades || [], opcoes?.raioM), opcoes?.territorio);
  }

  MI.storeCoverage = {
    analisar, recortar, classe, coordenadas, elegivel, distancia, raio,
    areaUnidade: (unidade, raioM) => coordenadas(unidade) ? areaDisco(raio(unidade, raioM)) : null,
    RAIO_PADRAO, RAIO_MIN, RAIO_MAX
  };
})(window.MI);
