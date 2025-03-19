const axios = require('axios');
const EventEmitter = require('./eventEmitter');

class SC2Monitor {
  constructor(config) {
    this.config = config;
    this.apiUrl = config.sc2_client.api_url;
    this.pollInterval = config.sc2_client.poll_interval;
    this.retryInterval = config.sc2_client.retry_interval || 5000;
    this.playerName = config.player.name;
    this.exactMatch = config.player.exact_match !== false; // Por padrão, true se não especificado
    this.events = new EventEmitter();
    
    // Estado atual
    this.currentScreen = [];
    this.currentGame = null;
    this.isInGame = false;
    this.lastGameState = null;
    this.isConnected = false;
    
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
      
      // Atualizar estado de conexão
      const wasConnected = this.isConnected;
      this.isConnected = true;
      
      if (!wasConnected && this.isConnected) {
        console.log('Conectado ao cliente do SC2');
        this.events.emit('sc2Connected');
      }
      
      // Detectar mudança de tela
      if (JSON.stringify(activeScreens) !== JSON.stringify(this.currentScreen)) {
        const oldScreen = [...this.currentScreen];
        this.currentScreen = activeScreens;
        this.events.emit('screenChanged', {
          fromScreen: this.getScreenName(oldScreen),
          toScreen: this.getScreenName(activeScreens)
        });
      }
      
      // Verificar se está em jogo (telas vazias = em jogo)
      const wasInGame = this.isInGame;
      this.isInGame = activeScreens.length === 0;
      
      // Verificar estado do jogo
      const gameResponse = await axios.get(`${this.apiUrl}/game`);
      const gameState = gameResponse.data;
      
      // Se entrou em um jogo
      if (this.isInGame && !wasInGame) {
        this.handleGameStart(gameState);
      }
      
      // Se saiu de um jogo
      if (!this.isInGame && wasInGame) {
        this.handleGameEnd(gameState);
      }
      
      // Atualizar estado do jogo atual
      this.currentGame = gameState;
      
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
  
  handleGameStart(gameState) {
    if (gameState.isReplay) {
      console.log('Detectado início de replay');
      
      // Encontrar jogadores do tipo "user"
      const users = gameState.players.filter(player => player.type === 'user');
      
      this.events.emit('replayStarted', {
        players: users.map(this.formatPlayer),
        isReplay: true
      });
    } else {
      console.log('Detectado início de partida');
      console.log('Jogadores:', gameState.players.map(p => `${p.name} (${p.race})`).join(', '));
      
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
        isReplay: false
      });
    }
    
    this.lastGameState = { ...gameState };
  }
  
  handleGameEnd(gameState) {
    // Só disparar evento de fim de jogo se não for replay
    if (!this.lastGameState || this.lastGameState.isReplay) {
      return;
    }
    
    console.log('Detectado fim de partida');
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
      myPlayer: myPlayer ? this.formatPlayer(myPlayer) : null
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