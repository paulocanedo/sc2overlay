const axios = require('axios');
const EventEmitter = require('./eventEmitter');

// Estados possíveis da aplicação
const AppState = {
  IN_MENUS: 'IN_MENUS',       // Em alguma tela/menu
  IN_GAME: 'IN_GAME',         // Jogando uma partida
  IN_REPLAY: 'IN_REPLAY'      // Assistindo um replay
};

class SC2Monitor {
  constructor(config) {
    this.config = config;

    // Forçar o uso de IPv4 para resolver o problema de conexão
    let apiUrl = config.sc2_client.api_url;
    if (apiUrl.includes('localhost')) {
      apiUrl = apiUrl.replace('localhost', '127.0.0.1');
    } else if (apiUrl.includes('::1')) {
      apiUrl = apiUrl.replace('::1', '127.0.0.1');
    }

    this.apiUrl = apiUrl;
    console.log(`Conectando à API SC2 em: ${this.apiUrl}`);

    this.pollInterval = config.sc2_client.poll_interval;
    this.retryInterval = config.sc2_client.retry_interval || 5000;
    this.playerName = config.player.name;
    this.exactMatch = config.player.exact_match !== false;
    this.events = new EventEmitter();

    // Estado atual da aplicação
    this.currentState = AppState.IN_MENUS;
    this.currentScreen = [];
    this.currentGame = null;
    this.isConnected = false;
    this.lastGameState = null;

    // Iniciar monitoramento
    this.startMonitoring();
  }

  async startMonitoring() {
    console.log(`Iniciando monitoramento da API SC2 em ${this.apiUrl}`);
    console.log(`Procurando pelo jogador: "${this.playerName}" (Correspondência exata: ${this.exactMatch ? 'Sim' : 'Não'})`);

    // Função para tentar conectar
    const checkConnection = () => {
      this.checkState().catch(error => {
        console.error(`Erro ao conectar com o cliente SC2: ${error.message}`);
        console.log(`Tentando novamente em ${this.retryInterval/1000} segundos...`);
      });
    };

    // Iniciar o monitoramento periódico
    setInterval(() => this.checkState().catch(err => {
      console.error('Erro durante o monitoramento:', err.message);

      // Se perdeu a conexão, notifica
      if (this.isConnected) {
        this.isConnected = false;
        this.events.emit('sc2Disconnected');
      }
    }), this.pollInterval);

    // Primeira verificação imediata
    checkConnection();
  }

  async checkState() {
    try {
      // Verificar estado da UI
      const uiResponse = await axios.get(`${this.apiUrl}/ui`);
      const activeScreens = uiResponse.data.activeScreens || [];

      // Verificar estado do jogo
      const gameResponse = await axios.get(`${this.apiUrl}/game`);
      const gameState = gameResponse.data;

      // Atualizar estado de conexão
      const wasConnected = this.isConnected;
      this.isConnected = true;

      if (!wasConnected && this.isConnected) {
        console.log('Conectado ao cliente do SC2');
        this.events.emit('sc2Connected');
      }

      // Lógica da máquina de estados
      await this.updateState(activeScreens, gameState);

      // Atualizar estado do jogo atual
      this.currentGame = gameState;
      this.currentScreen = activeScreens;

    } catch (error) {
      console.error('Erro ao verificar estado do SC2:', error.message);

      // Detectar desconexão
      if (this.isConnected) {
        this.isConnected = false;
        console.log('Desconectado do cliente do SC2');
        this.events.emit('sc2Disconnected');
      }
    }
  }

  async updateState(activeScreens, gameState) {
    const isInGameUI = activeScreens.length === 0;
    const isReplay = gameState.isReplay || false;
    const prevState = this.currentState;

    let newState;

    // Determinar o novo estado
    if (isInGameUI) {
      // Verificar se é um replay ou uma partida válida
      if (isReplay) {
        newState = AppState.IN_REPLAY;
      } else if (this.isValid1v1Match(gameState)) {
        newState = AppState.IN_GAME;
      } else {
        // Se não for nem replay nem partida 1v1 válida, consideramos como estando nos menus
        // para não processar outros tipos de jogos (vs IA, etc)
        console.log('Detectado jogo que não é 1v1 entre jogadores humanos. Ignorando.');
        newState = AppState.IN_MENUS;
      }
    } else {
      newState = AppState.IN_MENUS;
    }

    // Verificar mudanças de estado e emitir eventos adequados
    if (prevState !== newState) {
      console.log(`Mudança de estado: ${prevState} -> ${newState}`);

      // Eventos de saída do estado anterior
      switch (prevState) {
        case AppState.IN_GAME:
          if (this.areAllResultsDecided(gameState)) {
            console.log('Detectado fim de partida');
            this.handleGameEnd(gameState);
          }
          break;

        case AppState.IN_REPLAY:
          if (newState === AppState.IN_MENUS) {
            console.log('Detectado fim de replay');
            this.events.emit('replayEnded', {
              timestamp: new Date().toISOString()
            });
          }
          break;

        case AppState.IN_MENUS:
          console.log('Saindo dos menus');
          this.events.emit('screenExited', {
            fromScreen: this.getScreenName(this.currentScreen),
            timestamp: new Date().toISOString()
          });
          break;
      }

      // Eventos de entrada no novo estado
      switch (newState) {
        case AppState.IN_GAME:
          console.log('Detectado início de partida 1v1');
          this.handleGameStart(gameState);
          break;

        case AppState.IN_REPLAY:
          console.log('Detectado início de replay');
          this.events.emit('replayStarted', {
            players: gameState.players.filter(player => player.type === 'user').map(this.formatPlayer),
            isReplay: true,
            timestamp: new Date().toISOString()
          });
          break;

        case AppState.IN_MENUS:
          console.log('Entrando nos menus');
          this.events.emit('screenEntered', {
            toScreen: this.getScreenName(activeScreens),
            timestamp: new Date().toISOString()
          });
          break;
      }

      // Verificar mudança de tela dentro do estado de menus
      if (prevState === AppState.IN_MENUS && newState === AppState.IN_MENUS &&
          JSON.stringify(this.currentScreen) !== JSON.stringify(activeScreens)) {
        this.events.emit('screenChanged', {
          fromScreen: this.getScreenName(this.currentScreen),
          toScreen: this.getScreenName(activeScreens),
          timestamp: new Date().toISOString()
        });
      }

      // Atualizar estado atual
      this.currentState = newState;
    }
    // Se não houve mudança de estado, verificar outras condições específicas
    else if (newState === AppState.IN_GAME) {
      // Verificar se o jogo terminou enquanto ainda está na tela do jogo
      if (this.lastGameState &&
          !this.areAllResultsDecided(this.lastGameState) &&
          this.areAllResultsDecided(gameState)) {
        console.log('Detectado fim de partida enquanto ainda na tela do jogo');
        this.handleGameEnd(gameState);
      }
    }
    // Verificar mudança de tela dentro do estado de menus
    else if (newState === AppState.IN_MENUS &&
        JSON.stringify(this.currentScreen) !== JSON.stringify(activeScreens)) {
      this.events.emit('screenChanged', {
        fromScreen: this.getScreenName(this.currentScreen),
        toScreen: this.getScreenName(activeScreens),
        timestamp: new Date().toISOString()
      });
    }

    // Salvar o estado do jogo para a próxima comparação
    this.lastGameState = { ...gameState };
  }

  // Verifica se é uma partida 1v1 válida (exatamente 2 jogadores humanos, sem IA)
  isValid1v1Match(gameState) {
    if (!gameState || !gameState.players) {
      return false;
    }

    // Filtrar jogadores por tipo
    const users = gameState.players.filter(player => player.type === 'user');
    const computers = gameState.players.filter(player => player.type === 'computer');

    // Verificar se temos exatamente 2 jogadores humanos e nenhuma IA
    return users.length === 2 && computers.length === 0;
  }

  // Verificar se todos os resultados dos jogadores estão decididos
  areAllResultsDecided(gameState) {
    if (!gameState || !gameState.players || gameState.players.length === 0) {
      return false;
    }

    // Verificar se é uma partida 1v1 válida
    if (!this.isValid1v1Match(gameState)) {
      return false;
    }

    // Verificar apenas jogadores do tipo 'user' (não verificar IA)
    const users = gameState.players.filter(player => player.type === 'user');

    // Verificar se todos os usuários têm resultados definidos que não são "Undecided"
    return users.every(player =>
        player.result &&
        player.result !== 'Undecided' &&
        player.result !== ''
    );
  }

  handleGameStart(gameState) {
    // Verificar se é uma partida 1v1 válida
    if (!this.isValid1v1Match(gameState)) {
      console.log('Jogo ignorado: não é uma partida 1v1 entre jogadores humanos');
      return;
    }

    // Encontrar jogadores do tipo "user"
    const users = gameState.players.filter(player => player.type === 'user');

    // Identificar meu jogador
    const myPlayer = this.findMyPlayer(users);

    if (myPlayer) {
      console.log(`Identificado como jogador: ${myPlayer.name}`);
    } else {
      console.warn(`ATENÇÃO: Não foi possível identificar você entre os jogadores!`);
      console.warn(`Verifique se o nome "${this.playerName}" no arquivo config.yaml corresponde ao seu nome no jogo.`);
    }

    this.events.emit('gameStarted', {
      players: users.map(this.formatPlayer),
      myPlayer: myPlayer ? this.formatPlayer(myPlayer) : null,
      isReplay: false,
      timestamp: new Date().toISOString()
    });
  }

  handleGameEnd(gameState) {
    // Verificar se é uma partida 1v1 válida
    if (!this.isValid1v1Match(gameState)) {
      console.log('Fim de jogo ignorado: não é uma partida 1v1 entre jogadores humanos');
      return;
    }

    console.log('Estado final do jogo:', JSON.stringify(gameState, null, 2));

    // Encontrar jogadores do tipo "user"
    const users = gameState.players.filter(player => player.type === 'user');

    // Identificar meu jogador
    const myPlayer = this.findMyPlayer(users);

    if (myPlayer) {
      console.log(`Seu resultado: ${myPlayer.result}`);
    } else {
      console.warn(`ATENÇÃO: Não foi possível identificar você entre os jogadores no fim da partida!`);
      console.warn(`Verifique se o nome "${this.playerName}" no arquivo config.yaml corresponde ao seu nome no jogo.`);
    }

    this.events.emit('gameEnded', {
      players: users.map(this.formatPlayer),
      myPlayer: myPlayer ? this.formatPlayer(myPlayer) : null,
      timestamp: new Date().toISOString()
    });
  }

  formatPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      race: player.race,
      result: player.result
    };
  }

  getScreenName(screens) {
    if (screens.length === 0) {
      return 'InGame';
    }

    // Extrair o nome da tela principal (geralmente o último elemento)
    const mainScreen = screens[screens.length - 1];
    return mainScreen.split('/').pop();
  }

  findMyPlayer(players) {
    if (!players || players.length === 0) {
      return null;
    }

    // Se correspondência exata estiver ativada
    if (this.exactMatch) {
      return players.find(player => player.name === this.playerName);
    }

    // Caso contrário, fazer correspondência mais flexível (case insensitive, correspondência parcial)
    const playerNameLower = this.playerName.toLowerCase();
    const possibleMatches = players.filter(player =>
        player.name && player.name.toLowerCase().includes(playerNameLower)
    );

    if (possibleMatches.length === 0) {
      console.warn(`Não foi possível encontrar jogador com nome similar a "${this.playerName}"`);
      return null;
    }

    if (possibleMatches.length > 1) {
      console.warn(`Encontrados múltiplos jogadores com nome similar a "${this.playerName}". Usando o primeiro.`);
      console.warn('Jogadores encontrados:', possibleMatches.map(p => p.name).join(', '));
    }

    return possibleMatches[0];
  }

  on(event, callback) {
    this.events.on(event, callback);
  }
}

module.exports = SC2Monitor;