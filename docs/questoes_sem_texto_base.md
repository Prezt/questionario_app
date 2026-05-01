# Questoes com Texto-Base Ausente

Questoes que referenciam textos para interpretacao mas nao possuem o conteudo do texto na estrutura dos dados (campo `text` contem apenas o enunciado, sem passagem/texto-base associado).

**Total: 17 questoes**

---

## humanas_enem_2022.json (7 questoes)

| Questao | Enunciado |
|---------|-----------|
| 47 | "No trecho, a filosofa Hannah Arendt mostra a importancia da linguagem no processo de" |
| 50 | "No texto, ha uma critica ao modo de ocupacao do espaco amazonico pautada na" |
| 61 | "A consequencia da mudanca tecnologica apresentada neste texto e a" |
| 67 | "O texto apresenta uma estrategia usada pelo movimento social para" |
| 73 | "Com base no texto, a fixacao dessa data comemorativa tinha por objetivo" |
| 77 | "De acordo com o texto, a importancia da medicina se justifica no ambito dos objetivos" |
| 85 | "O rito mencionado nos textos demonstra a capacidade da Igreja em" |

## humanas_enem_2023.json (1 questao)

| Questao | Enunciado |
|---------|-----------|
| 87 | "Conforme descrito nos textos, o tratamento dispensado aos grupos mencionados se fundamentava em" |

## linguagens_enem_2022.json (4 questoes)

| Questao | Enunciado |
|---------|-----------|
| 2 | "O texto aborda relacoes interpessoais com o objetivo de" |
| 5 | "Nesse poema, o eu lirico evidencia um sentimento de" |
| 5 | "No texto, as palavras 'crianza' e 'tribu' sao usadas para" |
| 41 | "No texto, o personagem vincula ao carnaval atitudes e reacoes coletivas diante das quais expressa" |

## linguagens_enem_2023.json (5 questoes)

| Questao | Enunciado |
|---------|-----------|
| 3 | "Nesse poema, o eu poetico enaltece a" |
| 4 | "Nesse texto, a expressao 'cortina de humo' revela que o manipulador" |
| 28 | "A funcao emotiva presente no poema cumpre o proposito o eu lirico de" |

---

## Causa

A estrutura atual dos JSONs em `public/` possui apenas o campo `text` (enunciado). Questoes de interpretacao de texto precisam de um campo adicional — sugestao: `passage` ou `textoBase` — para armazenar a passagem que deve ser lida antes de responder.

## Proximos Passos

- [ ] Definir campo padrao (`passage` ou `textoBase`) para texto-base nas questoes
- [ ] Levantar os textos originais do ENEM para cada questao listada
- [ ] Atualizar os JSONs correspondentes com os textos-base
