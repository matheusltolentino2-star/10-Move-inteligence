/* 10 Move Intelligence — referência geográfica do Brasil
   Usada para (a) gerar a base demonstrativa e (b) normalizar UF em arquivos importados. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  MI.UF_NOMES = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
    DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
    MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
    PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
    SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
  };

  MI.UF_REGIAO = {
    AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
    AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste',
    PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
    DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
    ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
    PR: 'Sul', RS: 'Sul', SC: 'Sul'
  };


  /* Mapa nome completo -> sigla (para normalizar importações) */
  MI.UF_POR_NOME = (function () {
    const m = {};
    Object.keys(MI.UF_NOMES).forEach(function (uf) { m[MI.slug(MI.UF_NOMES[uf])] = uf; });
    m['distrito_federal'] = 'DF'; m['brasilia'] = 'DF';
    return m;
  })();

  MI.normalizeUf = function (v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    const up = s.toUpperCase();
    if (up.length === 2 && MI.UF_NOMES[up]) return up;
    const byName = MI.UF_POR_NOME[MI.slug(s)];
    return byName || null;
  };

  /* Cidades por UF com peso relativo (aproxima concentração urbana).
     w = peso de amostragem; não representa população oficial. */
  MI.CIDADES = [
    ['São Paulo', 'SP', 120], ['Guarulhos', 'SP', 26], ['Campinas', 'SP', 24], ['São Bernardo do Campo', 'SP', 18],
    ['Santo André', 'SP', 15], ['Osasco', 'SP', 14], ['Sorocaba', 'SP', 13], ['Ribeirão Preto', 'SP', 13],
    ['Santos', 'SP', 11], ['São José dos Campos', 'SP', 12], ['Jundiaí', 'SP', 9], ['Piracicaba', 'SP', 8],
    ['Bauru', 'SP', 7], ['Diadema', 'SP', 8], ['Mauá', 'SP', 7], ['Barueri', 'SP', 7],
    ['Rio de Janeiro', 'RJ', 78], ['Niterói', 'RJ', 14], ['São Gonçalo', 'RJ', 13], ['Duque de Caxias', 'RJ', 12],
    ['Nova Iguaçu', 'RJ', 10], ['Campos dos Goytacazes', 'RJ', 6], ['Petrópolis', 'RJ', 5], ['Macaé', 'RJ', 5],
    ['Belo Horizonte', 'MG', 46], ['Contagem', 'MG', 12], ['Uberlândia', 'MG', 12], ['Juiz de Fora', 'MG', 9],
    ['Betim', 'MG', 7], ['Montes Claros', 'MG', 6], ['Uberaba', 'MG', 5], ['Nova Lima', 'MG', 4],
    ['Curitiba', 'PR', 34], ['Londrina', 'PR', 10], ['Maringá', 'PR', 9], ['Ponta Grossa', 'PR', 6],
    ['São José dos Pinhais', 'PR', 6], ['Cascavel', 'PR', 5], ['Foz do Iguaçu', 'PR', 4],
    ['Porto Alegre', 'RS', 30], ['Caxias do Sul', 'RS', 9], ['Canoas', 'RS', 7], ['Pelotas', 'RS', 6],
    ['Santa Maria', 'RS', 5], ['Novo Hamburgo', 'RS', 5], ['Gravataí', 'RS', 5],
    ['Florianópolis', 'SC', 16], ['Joinville', 'SC', 11], ['Blumenau', 'SC', 8], ['São José', 'SC', 6],
    ['Itajaí', 'SC', 5], ['Chapecó', 'SC', 4], ['Balneário Camboriú', 'SC', 5],
    ['Salvador', 'BA', 38], ['Feira de Santana', 'BA', 10], ['Vitória da Conquista', 'BA', 6],
    ['Camaçari', 'BA', 5], ['Lauro de Freitas', 'BA', 5], ['Ilhéus', 'BA', 4],
    ['Recife', 'PE', 30], ['Jaboatão dos Guararapes', 'PE', 11], ['Olinda', 'PE', 8], ['Caruaru', 'PE', 6],
    ['Paulista', 'PE', 5], ['Petrolina', 'PE', 4],
    ['Fortaleza', 'CE', 32], ['Caucaia', 'CE', 8], ['Juazeiro do Norte', 'CE', 5], ['Maracanaú', 'CE', 5],
    ['Sobral', 'CE', 4],
    ['Brasília', 'DF', 34], ['Goiânia', 'GO', 24], ['Aparecida de Goiânia', 'GO', 9], ['Anápolis', 'GO', 6],
    ['Rio Verde', 'GO', 4],
    ['Manaus', 'AM', 22], ['Belém', 'PA', 20], ['Ananindeua', 'PA', 7], ['Santarém', 'PA', 4],
    ['Marabá', 'PA', 4],
    ['São Luís', 'MA', 16], ['Imperatriz', 'MA', 5], ['Teresina', 'PI', 14], ['Parnaíba', 'PI', 4],
    ['Natal', 'RN', 14], ['Mossoró', 'RN', 5], ['Parnamirim', 'RN', 4],
    ['João Pessoa', 'PB', 14], ['Campina Grande', 'PB', 6],
    ['Maceió', 'AL', 14], ['Arapiraca', 'AL', 4],
    ['Aracaju', 'SE', 11], ['Nossa Senhora do Socorro', 'SE', 4],
    ['Vitória', 'ES', 10], ['Vila Velha', 'ES', 9], ['Serra', 'ES', 8], ['Cariacica', 'ES', 6],
    ['Campo Grande', 'MS', 15], ['Dourados', 'MS', 5],
    ['Cuiabá', 'MT', 13], ['Várzea Grande', 'MT', 5], ['Rondonópolis', 'MT', 4], ['Sinop', 'MT', 3],
    ['Porto Velho', 'RO', 8], ['Ji-Paraná', 'RO', 3],
    ['Rio Branco', 'AC', 6], ['Macapá', 'AP', 6], ['Boa Vista', 'RR', 6],
    ['Palmas', 'TO', 7], ['Araguaína', 'TO', 3]
  ].map(function (c) { return { cidade: c[0], uf: c[1], w: c[2] }; });

  /* Bairros genéricos para compor endereço aproximado (sem precisão real) */
  MI.BAIRROS = ['Centro', 'Jardins', 'Vila Nova', 'Boa Vista', 'Santa Luzia', 'São José',
    'Industrial', 'Alto da Serra', 'Parque das Flores', 'Bela Vista', 'Zona Sul', 'Zona Norte',
    'Morumbi', 'Cidade Alta', 'Lagoa', 'Praia Grande', 'Nova Esperança', 'Jardim Europa'];

})(window.MI);
