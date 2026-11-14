# Little Plaza

Uma praça compartilhada, em tempo real, onde cada visitante é um ponteiro. O site é todo em inglês; esta documentação está em português.

O visitante entra sem cadastro, anda pela praça com o mouse (ou com o dedo), mexe nas atrações, conversa por chat com quem está perto e coleciona figurinhas.

## Aviso de origem

Little Plaza é um projeto independente. O gênero, um lugar compartilhado em que cada visitante é um ponteiro, ficou conhecido com **Cursor Camp**, de Neal Agarwal ([neal.fun](https://neal.fun)). Daqui, o nome, a arte, o mapa, os sons e o código são próprios: nada foi copiado de lá.

## O que há na praça

| Lugar | O que se faz |
| --- | --- |
| Bandstand (coreto) | O piso tem oito fatias; cada uma toca uma nota. Vários ponteiros fazem música juntos. |
| Fountain (chafariz) | Entrar na água espirra. Clicar da beirada joga uma moeda; a contagem é de todos. |
| Pigeons (pombos) | Voam quando alguém passa correndo e seguem quem tem pipoca. |
| Popcorn cart | Esperar na marca rende um saquinho de pipoca. |
| Playground | Gangorra (pesa para o lado com mais ponteiros), balanços (impulso no ritmo) e amarelinha. |
| Pitch (campinho) | Bola com física, dois gols e placar compartilhado. |
| Tiles (azulejos) | Mural coletivo: cada clique pinta um azulejo com a cor do visitante. |
| Flowerbed (canteiro) | Cada clique planta uma flor. |
| Coworking | Notebooks que "programam" e somam commits num telão, lousa para desenhar junto, cafezinho e o botão de deploy. |
| Arcade (fliperama) | Três minijogos próprios (Popcorn Catch, Worm, Rally) com recorde compartilhado, e uma pista de dança. |
| Chat | Enter abre o campo. Só quem está perto lê; a mensagem some em segundos. |
| Stickers | 24 figurinhas, três delas secretas. Ficam guardadas no navegador. |

À noite (pelo relógio de quem visita) os postes acendem e aparecem vaga-lumes.

## Rodar no seu computador

```bash
npm install
```

```bash
npm run dev
```

Abra o endereço que aparecer. Sem mais nada, o site roda em **modo de demonstração**: os outros ponteiros são simulados (a barra de cima avisa) e o multiplayer só acontece entre abas do mesmo navegador.

Para ver o multiplayer de verdade no seu computador, rode o servidor de tempo real em outro terminal:

```bash
npm run relay
```

E crie um arquivo `.env.local` com:

```
VITE_REALTIME_URL=ws://localhost:8787
```

## Publicar

São duas peças.

**1. O site, na Vercel.** Importe o repositório. A Vercel reconhece o Vite sozinha (comando `npm run build`, pasta `dist`). O `vercel.json` só acrescenta cabeçalhos de segurança.

**2. O servidor de tempo real.** É o `server/relay.mjs`, um processo Node que fica ligado e mantém conexões WebSocket abertas. Serve qualquer hospedagem que rode Node continuamente (Render, Railway, Fly.io, uma VPS):

- instalar: `npm install`
- iniciar: `npm run relay`
- variável `ALLOWED_ORIGINS`: o endereço do site na Vercel, por exemplo `https://seu-site.vercel.app`. Sem ela o servidor aceita conexão de qualquer site.

Depois, na Vercel, crie a variável de ambiente `VITE_REALTIME_URL` com o endereço do servidor (`wss://...`) e publique de novo. Sem essa variável o site publicado fica em modo de demonstração.

Outras variáveis do servidor estão no topo de `server/relay.mjs` (limite por sala, por endereço e total).

O servidor guarda o estado da praça (azulejos, flores, moedas, placar, commits, recordes) só na memória: se ele reiniciar, a praça recomeça em branco. Conversa nenhuma é guardada.

> A Vercel anunciou suporte a WebSocket em Functions em 2026. Este projeto não usa esse recurso: não foi possível ler a documentação oficial durante o desenvolvimento, e mesmo com ele seria preciso um armazenamento externo para os visitantes de instâncias diferentes se enxergarem.

## Segurança do chat

O que já está feito:

- Toda mensagem passa pelas mesmas regras no navegador e no servidor (`shared/protocol.js`). O servidor nunca repassa o que recebeu: ele reconstrói a mensagem campo a campo.
- Limite de 120 caracteres e de uma mensagem a cada 1,2 s por visitante, aplicado no servidor.
- Links, e-mails, sequências de 8 ou mais dígitos e uma lista de palavrões (português e inglês) viram `•••`.
- O texto é desenhado no canvas ou inserido como texto puro. Nunca vira HTML.
- Nada é armazenado, e não existem nomes nem perfis.
- O visitante pode desligar o chat no menu.

O que **não** existe e precisa de decisão sua antes de divulgar o site:

- Moderação humana, denúncia, silenciar um visitante específico e banimento.
- Verificação de idade. Um chat aberto e anônimo num site com cara de brinquedo atrai crianças.
- Um filtro de palavras é fácil de driblar. Ele reduz o problema, não resolve.

## Endereços úteis para testar

- `?mode=free`: não prende o mouse; a câmera anda quando o ponteiro encosta na borda.
- `?hour=21`: força a hora do dia (para ver a noite).
- `?room=nome`: abre uma praça separada.
- `?debug`: expõe o jogo em `window.__pracinha` no console.

## Como o código está organizado

```
index.html            página e textos da interface
shared/protocol.js    regras da rede e filtro do chat (site e servidor usam o mesmo arquivo)
server/relay.mjs      servidor de tempo real
src/main.ts           ponto de entrada
src/game.ts           laço principal: entrada, rede, câmera, desenho
src/ui.ts             telas em HTML: entrada, menu, álbum, chat, avisos
src/input.ts          mouse preso, mouse solto e toque
src/net/              transporte local (entre abas) e por WebSocket
src/store.ts          estado compartilhado
src/actors.ts         desenho dos ponteiros, expressões e balões de fala
src/bots.ts           visitantes simulados do modo de demonstração
src/album.ts          figurinhas
src/audio.ts          todos os sons, sintetizados na hora (não há arquivo de áudio)
src/arcade/           os três minijogos
src/world/            cenário e uma classe por atração
```

Para mudar o nome do site, troque "Little Plaza" em `index.html`. Para mudar cores, veja `src/config.ts`. Cada atração é um arquivo em `src/world/` que implementa a interface `Activity` de `src/types.ts`; para criar outra, escreva a classe e acrescente-a à lista em `src/game.ts`.

## O que foi testado

Com um navegador automatizado: todas as atrações, o chat e o filtro, o álbum, a noite, o modo de toque em tela de celular, duas abas no modo de demonstração, três navegadores ligados ao servidor de tempo real (presença, chat, estado compartilhado, bola, gol, troca de anfitrião), e o build de produção servido com os cabeçalhos do `vercel.json`.

Não foi testado: a publicação real na Vercel, o servidor numa hospedagem de verdade, navegadores além do Chromium, e a praça com muita gente ao mesmo tempo.
