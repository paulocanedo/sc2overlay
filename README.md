# SC2 Stream Overlays

Conjunto de overlays para exibir informações do StarCraft II em streams, utilizando a Client API do SC2.

## Características

### Múltiplos Overlays
- **Stats Dashboard**: Painel vertical detalhado para estatísticas completas
- **Match Bar**: Barra compacta para exibir informações sobre a partida atual

## Pré-requisitos

- StarCraft II com acesso à Client API

## Pré-requisitos - desenvolvimento
- Docker ou 
- Nodejs

## Uso normal

0. Crie um arquivo chamado `config.yaml` a partir do `config.yaml.example` e preencha as informações:
   - Atualize o nickname em nome do jogador
   - Ajuste outras configurações conforme necessário

0. Execute o arquivo sc2overlay.exe

0. Acesse o índice de overlays em `http://localhost:3000`

## Uso com docker

0. Clone este repositório:
   ```bash
   git clone https://github.com/paulocanedo/sc2overlay.git
   cd sc2overlay
   ```

0. Instale as dependências:
   ```bash
   docker compose up -d
   ```

## Uso no OBS Studio

### Adicionando o Stats Dashboard
1. Adicione uma nova fonte de "Navegador"
2. Configure a URL como `http://localhost:3000/stats-dashboard`
3. Defina a largura como 350 e a altura como 600
4. Ative "Atualizar navegador quando a cena se tornar ativa"

### Adicionando o Match Bar
1. Adicione uma nova fonte de "Navegador"
2. Configure a URL como `http://localhost:3000/match-bar`
3. Defina a largura como 500 e a altura como 60
4. Ative "Atualizar navegador quando a cena se tornar ativa"

## Personalização

Você pode personalizar a aparência dos overlays editando:

- `config.yaml` - Para configurações gerais
- `public/css/styles.css` - Para modificar as cores e estilos do Stats Dashboard
- `public/css/match-bar.css` - Para modificar as cores e estilos do Match Bar
- Arquivos HTML em `public/` - Para alterar a estrutura dos overlays


## Suporte

Se você encontrar problemas ou tiver sugestões, abra uma issue no repositório do GitHub.

## Licença

Este projeto está licenciado sob a Licença MIT.