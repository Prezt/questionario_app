# Voiceover — Show do Milhão

10 arquivos `.mp3` neste diretório com placeholders gerados via `say -v Rocko`
(TTS nativo do macOS, voz BR robótica mas funcional). Substitua por TTS
profissional sempre que possível — os filenames são os mesmos.

Se um arquivo faltar ou o browser não conseguir tocar, o jogo segue normalmente
sem o áudio (no-op silencioso). O toggle "Som" das Opções respeita o voiceover.

## Arquivos esperados

| Arquivo | Texto | Quando dispara |
|---|---|---|
| `mil-inicio.mp3` | "Bem vindos ao Show! Hora de testar seu conhecimento." | startGame Milhão |
| `mil-pergunta-proxima.mp3` | "Vamos à próxima pergunta!" | logo após início e após cada acerto |
| `mil-acerto.mp3` | "Acertou! Boa!" | resposta correta no Milhão |
| `mil-erro.mp3` | "Errou! Que pena." | resposta errada (game over) |
| `mil-patamar.mp3` | "Chegou no patamar! Prêmio garantido." | confirmação do 5º e 10º nível |
| `mil-parou.mp3` | "Decidiu parar! Sai com seu prêmio." | clicou "Parar" |
| `mil-cartas.mp3` | "Vamos às cartas! Vire uma." | usou ajuda das Cartas |
| `mil-universitarios.mp3` | "Vamos aos universitários! Eles vão palpitar." | usou ajuda dos Universitários |
| `mil-plateia.mp3` | "Plateia, sua opinião!" | usou ajuda da Plateia |
| `mil-milhao.mp3` | "Milhão! Milhão! Você ganhou o milhão!" | venceu todos os níveis |

## Gerar localmente com macOS `say` (placeholder)

```bash
cd public/audio/voiceover
say -v "Rocko" "Bem vindos ao Show!" -o /tmp/x.aiff
afconvert /tmp/x.aiff -d aac -f m4af mil-inicio.mp3
```

Vozes BR disponíveis: `Rocko`, `Reed`, `Eddy`, `Grandpa` (masculinas),
`Luciana`, `Flo`, `Grandma`, `Sandy`, `Shelley` (femininas).

## Upgrade pra TTS profissional

Use voz masculina madura, animada, em pt-BR. Boas opções:

- **ElevenLabs**: voz "Adam"/"Onyx" ajustada pra entusiástico (style 0.6, stability 0.4)
- **Azure Speech**: `pt-BR-AntonioNeural` com `style="cheerful"` ou `pt-BR-FabioNeural`
- **Google Cloud TTS**: `pt-BR-Wavenet-B` (masculina madura)

Mantenha cada áudio curto (1–3 segundos). Não use o nome "Silvio Santos" nem
bordões registrados da SBT.

## Formato técnico

- **Extensão**: `.mp3` (AAC) — universal nos browsers modernos
- **Mono** funciona bem; estéreo é desnecessário
- **Sample rate**: 44.1 kHz
- **Loudness**: ~-16 LUFS pra ficar consistente com os efeitos do jogo
- **Tamanho**: ~10–20 KB cada, ~140 KB total
