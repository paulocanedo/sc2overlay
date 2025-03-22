// Conectar ao Socket.IO
const socket = io();

// Elementos da interface
const elements = {
  statusIcon: document.getElementById('status-icon'),
  panelTitle: document.getElementById('panel-title'),
  totalGames: document.getElementById('total-games'),
  totalWins: document.getElementById('total-wins'),
  totalLosses: document.getElementById('total-losses'),
  winPercentage: document.getElementById('win-percentage'),
  zergWins: document.getElementById('zerg-wins'),
  zergLosses: document.getElementById('zerg-losses'),
  terranWins: document.getElementById('terran-wins'),
  terranLosses: document.getElementById('terran-losses'),
  protossWins: document.getElementById('protoss-wins'),
  protossLosses: document.getElementById('protoss-losses'),
  randomWins: document.getElementById('random-wins'),
  randomLosses: document.getElementById('random-losses'),
  lastOpponentName: document.getElementById('last-opponent-name'),
  lastOpponentRaceIcon: document.getElementById('last-opponent-race-icon'),
  lastGameTime: document.getElementById('last-game-time'),
  currentStatus: document.getElementById('current-status'),
  lastGameContainer: document.getElementById('last-game-container'),
  noGame: document.querySelector('.no-game'),
  gameInfo: document.querySelector('.game-info'),
  // Blocos de resultado recentes
  resultBlocks: Array.from({ length: 10 }, (_, i) => document.getElementById(`result-block-${i}`))
};

// Estado da aplicação
let appState = {
  connected: false,
  inGame: false,
  currentScreen: 'Unknown',
  config: null,
  recentMatches: []
};

// Funções de utilidade
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Desconhecido';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHours = Math.round(diffMin / 60);
  
  if (diffSec < 60) return `${diffSec} segundos atrás`;
  if (diffMin < 60) return `${diffMin} minutos atrás`;
  if (diffHours < 24) return `${diffHours} horas atrás`;
  
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function getRaceIcon(race) {
  switch (race) {
    case 'Zerg': return '<img src="/img/race/zerg.svg" alt="Zerg" class="race-icon-img">';
    case 'Terr': return '<img src="/img/race/terran.svg" alt="Terran" class="race-icon-img">';
    case 'Prot': return '<img src="/img/race/protoss.svg" alt="Protoss" class="race-icon-img">';
    case 'random': return '<img src="/img/race/random.svg" alt="Random" class="race-icon-img">';
    default: return '';
  }
}

function updateStatus(status, message) {
  elements.statusIcon.className = status;
  elements.currentStatus.textContent = message;
  
  if (status === 'ingame') {
    elements.currentStatus.classList.add('pulse');
  } else {
    elements.currentStatus.classList.remove('pulse');
  }
}

// Função para atualizar as informações do último jogo
function updateLastGameInfo(lastGame) {
  if (lastGame && lastGame.opponent) {
    elements.noGame.classList.add('sc2-hidden');
    elements.gameInfo.classList.remove('sc2-hidden');
    
    elements.lastOpponentName.textContent = lastGame.opponent.name || 'Desconhecido';
    
    if (lastGame.opponent.race) {
      elements.lastOpponentRaceIcon.innerHTML = getRaceIcon(lastGame.opponent.race);
    } else {
      elements.lastOpponentRaceIcon.innerHTML = '';
    }
    
    // Mostrar ícone de vitória ou derrota
    const victoryIcon = document.getElementById('victory-icon');
    const defeatIcon = document.getElementById('defeat-icon');
    
    if (victoryIcon && defeatIcon) {
      if (lastGame.result === 'Victory') {
        victoryIcon.style.display = 'inline-block';
        defeatIcon.style.display = 'none';
      } else {
        victoryIcon.style.display = 'none';
        defeatIcon.style.display = 'inline-block';
      }
    }
    
    elements.lastGameTime.textContent = formatTimeAgo(lastGame.timestamp);
  } else {
    elements.noGame.classList.remove('sc2-hidden');
    elements.gameInfo.classList.add('sc2-hidden');
  }
}

// Função para atualizar a faixa lateral com resultados recentes
function updateRecentResultsStrip() {
  // Limpar todos os blocos primeiro (definir para cinza)
  elements.resultBlocks.forEach(block => {
    block.className = 'result-block';
  });
  
  // Preencher com os resultados disponíveis
  if (appState.recentMatches && appState.recentMatches.length > 0) {
    // Limitamos a 10 partidas e revertemos para mostrar as mais recentes no topo
    const matches = appState.recentMatches.slice(0, 10).reverse();
    
    matches.forEach((match, index) => {
      if (index < elements.resultBlocks.length) {
        if (match.result === 'Victory') {
          elements.resultBlocks[index].className = 'result-block victory';
        } else if (match.result === 'Defeat') {
          elements.resultBlocks[index].className = 'result-block defeat';
        }
      }
    });
  }
}

// Função principal para atualizar estatísticas
function updateStats(stats) {
  if (!stats) return;
  
  // Estatísticas gerais
  if (stats.total) {
    elements.totalGames.textContent = stats.total.games || 0;
    elements.totalWins.textContent = stats.total.wins || 0;
    elements.totalLosses.textContent = stats.total.losses || 0;
    
    // Calcular porcentagem de vitórias
    const totalGames = stats.total.games || 0;
    const totalWins = stats.total.wins || 0;
    const winPercentage = totalGames > 0 
      ? Math.round((totalWins / totalGames) * 100) 
      : 0;
    elements.winPercentage.textContent = `${winPercentage}%`;
  }
  
  // Estatísticas por raça
  if (stats.byRace) {
    if (stats.byRace.Zerg) {
      elements.zergWins.textContent = stats.byRace.Zerg.wins || 0;
      elements.zergLosses.textContent = stats.byRace.Zerg.losses || 0;
    }
    
    if (stats.byRace.Terr) {
      elements.terranWins.textContent = stats.byRace.Terr.wins || 0;
      elements.terranLosses.textContent = stats.byRace.Terr.losses || 0;
    }
    
    if (stats.byRace.Prot) {
      elements.protossWins.textContent = stats.byRace.Prot.wins || 0;
      elements.protossLosses.textContent = stats.byRace.Prot.losses || 0;
    }
    
    if (stats.byRace.random) {
      elements.randomWins.textContent = stats.byRace.random.wins || 0;
      elements.randomLosses.textContent = stats.byRace.random.losses || 0;
    }
  }
  
  // Último jogo
  updateLastGameInfo(stats.lastGame);
}

// Carregar partidas recentes
async function loadRecentMatches() {
  try {
    const response = await fetch('/api/matches/recent?limit=10');
    const matches = await response.json();
    
    console.log('Partidas recentes carregadas:', matches);
    
    // Armazenar no estado da aplicação
    appState.recentMatches = matches;
    
    // Atualizar a faixa de resultados
    updateRecentResultsStrip();
  } catch (error) {
    console.error('Erro ao carregar partidas recentes:', error);
  }
}

// Carregar configuração
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    appState.config = await response.json();
    
    // Atualizar título
    if (appState.config && appState.config.overlay && appState.config.overlay.title) {
      elements.panelTitle.textContent = appState.config.overlay.title;
    }
    
    // Aplicar tema
    if (appState.config && appState.config.overlay && appState.config.overlay.theme === 'light') {
      document.body.classList.add('light-theme');
    }
    
    console.log('Configuração carregada:', appState.config);
  } catch (error) {
    console.error('Erro ao carregar configuração:', error);
  }
}

// Carregar estatísticas iniciais
async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    const stats = await response.json();
    updateStats(stats);
    console.log('Estatísticas iniciais carregadas com sucesso');
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error);
  }
}

// Eventos do Socket.IO
socket.on('connect', () => {
  console.log('Conectado ao servidor');
  appState.connected = true;
  updateStatus('online', 'Conectado');
  
  // Carregar configuração e estatísticas iniciais
  loadConfig();
  loadStats();
  loadRecentMatches();
});

socket.on('disconnect', () => {
  console.log('Desconectado do servidor');
  appState.connected = false;
  updateStatus('offline', 'Desconectado');
});

socket.on('gameStarted', (data) => {
  console.log('Partida iniciada:', data);
  appState.inGame = true;
  
  let opponentName = "Desconhecido";
  if (data && data.players && data.players.length >= 1) {
    opponentName = data.players[0].name;
  }
  
  updateStatus('ingame', `Em jogo contra ${opponentName}`);
});

socket.on('gameEnded', (data) => {
  console.log('Partida finalizada:', data);
  appState.inGame = false;
  updateStatus('online', 'Jogo finalizado');
  
  // Se temos informação sobre o jogador, atualizar as informações do último jogo
  if (data && data.myPlayer) {
    const opponent = data.players.find(p => p.name !== data.myPlayer.name);
    if (opponent) {
      const lastGameInfo = {
        timestamp: new Date().toISOString(),
        myPlayer: data.myPlayer,
        opponent: opponent,
        result: data.myPlayer.result
      };
      
      updateLastGameInfo(lastGameInfo);
      
      // Recarregar partidas recentes
      setTimeout(loadRecentMatches, 1000);
    }
  }
});

socket.on('replayStarted', (data) => {
  console.log('Replay iniciado:', data);
  appState.inGame = true;
  updateStatus('ingame', 'Assistindo replay');
});

socket.on('screenChanged', (data) => {
  if (!data) return;
  
  console.log('Tela alterada:', data);
  appState.currentScreen = data.toScreen || 'Unknown';
  
  if (data.toScreen === 'InGame') {
    appState.inGame = true;
    updateStatus('ingame', 'Em jogo');
  } else {
    appState.inGame = false;
    updateStatus('online', `Na tela ${data.toScreen || 'desconhecida'}`);
  }
});

socket.on('statsUpdated', (stats) => {
  console.log('Estatísticas atualizadas:', stats);
  updateStats(stats);
  
  // Recarregar partidas recentes quando estatísticas forem atualizadas
  loadRecentMatches();
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  console.log('Overlay iniciado');
  updateStatus('offline', 'Aguardando conexão');
});