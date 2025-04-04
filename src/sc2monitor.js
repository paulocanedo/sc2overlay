const axios = require('axios');
const EventEmitter = require('./eventEmitter');
const { GameStateManager, GameState } = require('./gameStateManager');

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

    // Initialize game state manager
    this.gameStateManager = new GameStateManager({
      minGameEndCooldown: config.sc2_client.min_game_end_cooldown || 500,
      debug: config.debug || false
    });

    // Connect game state manager events to monitor events
    this.setupEventListeners();

    // State tracking
    this.isConnected = false;
    this.currentGame = null;
    this.currentScreen = [];

    // Start monitoring
    this.startMonitoring();
  }

  // Setup event listeners for game state manager
  setupEventListeners() {
    // Forward game state events to our events
    const events = [
      'stateChanged',
      'gameStarted',
      'gameEnded',
      'replayStarted',
      'replayEnded'
    ];

    events.forEach(eventName => {
      this.gameStateManager.on(eventName, data => {
        // Add player identification where appropriate
        if (data.players) {
          data.myPlayer = this.findMyPlayer(data.players);
        }

        // Forward the event
        this.events.emit(eventName, data);
      });
    });
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
      const uiData = uiResponse.data;

      // Verificar estado do jogo
      const gameResponse = await axios.get(`${this.apiUrl}/game`);
      const gameData = gameResponse.data;

      // Atualizar estado de conexão
      const wasConnected = this.isConnected;
      this.isConnected = true;

      if (!wasConnected && this.isConnected) {
        console.log('Conectado ao cliente do SC2');
        this.events.emit('sc2Connected');
      }

      // Handle screen changes for monitoring UI transitions
      this.handleScreenChanges(uiData.activeScreens || []);

      // Update game state using the manager
      this.gameStateManager.processGameData(uiData, gameData);

      // Update current game data
      this.currentGame = gameData;

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

  // Handle screen change events
  handleScreenChanges(activeScreens) {
    const prevScreen = this.currentScreen;

    // If screens changed
    if (JSON.stringify(prevScreen) !== JSON.stringify(activeScreens)) {
      // If we just entered a screen (from none to some)
      if (prevScreen.length === 0 && activeScreens.length > 0) {
        this.events.emit('screenEntered', {
          toScreen: this.getScreenName(activeScreens),
          timestamp: new Date().toISOString()
        });
      }
      // If we just exited a screen (from some to none)
      else if (prevScreen.length > 0 && activeScreens.length === 0) {
        this.events.emit('screenExited', {
          fromScreen: this.getScreenName(prevScreen),
          timestamp: new Date().toISOString()
        });
      }
      // If we changed from one screen to another
      else if (prevScreen.length > 0 && activeScreens.length > 0) {
        this.events.emit('screenChanged', {
          fromScreen: this.getScreenName(prevScreen),
          toScreen: this.getScreenName(activeScreens),
          timestamp: new Date().toISOString()
        });
      }

      // Update current screen
      this.currentScreen = [...activeScreens];
    }
  }

  // Get a friendly name for a screen
  getScreenName(screens) {
    if (screens.length === 0) {
      return 'InGame';
    }

    // Extract the name of the main screen (usually the last element)
    const mainScreen = screens[screens.length - 1];
    return mainScreen.split('/').pop();
  }

  // Find my player in the list of players
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

  // Get state history for debugging
  getStateHistory() {
    return this.gameStateManager.getStateHistory();
  }

  on(event, callback) {
    this.events.on(event, callback);
  }
}

module.exports = SC2Monitor;