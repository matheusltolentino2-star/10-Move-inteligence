# 10 Move Intelligence — regras permanentes

## 1. Toda mudança é aditiva

Funcionalidade nova complementa o que existe. Não substitui, não
reestrutura e não "aproveita para refazer" o que já estava validado.

Antes de tocar em componente estrutural — mapa, importação, navegação,
filtros, layout:

1. **Liste o que o componente já faz.** Por escrito, antes de editar.
2. **Marque o que é aprovado.** Comportamento que o usuário já usou e
   validou não é candidato a redesenho sem pedido explícito.
3. **Avalie o impacto.** Se a mudança remove algo, isso é uma decisão a
   ser declarada, não um efeito colateral.
4. **Implemente isolado.** Módulo novo, camada nova, arquivo novo. Reescrever
   um componente inteiro para acomodar uma funcionalidade pontual é a forma
   mais comum de perder qualidade sem perceber.
5. **Teste os fluxos antigos**, não só o novo.
6. **Valide no navegador.** Build passar não é evidência de nada visual.

### O caso que originou esta regra

A reconstrução do mapa em Leaflet (nov/2026) trouxe basemap, raio em metros
reais e seleção confiável — e deixou o mapa **sem rótulo nenhum**. Os
estados viraram polígonos coloridos anônimos. Também sumiram o botão de
voltar ao enquadramento e a tela cheia, que existiam na versão anterior.

Nada disso apareceu nos testes porque os testes cobriam o que foi
construído, não o que existia antes. Daí o item 5.

## 2. Camada analítica não sequestra a experiência

Cobertura, zonas, densidade, renda, fluxos, oportunidades: tudo isso é
**camada opcional** sobre a exploração territorial, nunca um modo novo.

Regras para qualquer camada:

- Desligada por padrão, salvo prova de que ajuda sempre.
- Ligar e desligar **não** reinicia zoom, não apaga seleção, não muda layout
  e não interrompe navegação.
- Desligar devolve a experiência exatamente como estava.
- Camada sem dado para mostrar fica **desabilitada com o motivo no título**,
  não escondida e não ativa mostrando vazio.

## 3. Honestidade do dado vale mais que a tela cheia

- Dado de terceiro (IBGE etc.) é rotulado como tal, com fonte, data de
  referência e resolução territorial. Nunca se mistura com dado da Smoov.
- Ausência de dado não é zero, e nem um nem outro é supressão por
  privacidade. Os três têm aparências distintas.
- Número aproximado é declarado como aproximado. Posição por centróide de
  município não vira endereço, e raio de cobertura não sai em volta dela.
- Área sobreposta não se soma. Correlação não vira causa. Região sem
  cobertura não vira oportunidade automática.
- Quando falta dado para uma análise, a tela diz o que falta e onde
  preencher — em vez de sumir ou mostrar resultado falso.

## 4. Antes de considerar pronto

- Rodar no navegador e percorrer os fluxos antigos, não só o novo.
- Conferir em mais de uma resolução.
- Checar o console; erro de console não é detalhe.
- Conferir que produção serve o que o repositório tem: arquivo referenciado
  e não versionado dá 404 silencioso.

## 5. Git e produção

- Nada de rollback indiscriminado. Restaurar comportamento é seletivo.
- Não reescrever histórico.
- Não commitar com `git add -A`: este repositório recebe trabalho de mais
  de uma sessão ao mesmo tempo, e varrer tudo leva junto o que não é seu.
- Geradores e bases de dados (`smoov_demo/`, `smoov_full/`) ficam fora do
  versionamento.

## 6. Contexto do produto

- Interface em português do Brasil.
- A base pode conter dados pessoais reais de clientes da Smoov. O uso com
  dados reais exige base legal e contrato de tratamento sob a LGPD — isso é
  decisão das empresas, e está registrado em `INTELIGENCIA-TERRITORIAL.md`
  e na aba de privacidade da própria aplicação.
- Três perfis: Administrador Smoov, Equipe 10 Move, Administrador técnico.
  Quem decide o que cada um vê é o papel no servidor, não a interface.
