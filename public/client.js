// Conectar ao Socket.IO
const socket = io();

// Elementos da interface
const elements = {
  statusIcon: document.getElementById('status-icon'),
  statusText: document.getElementById('status-text'),
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
  lastOpponentRace: document.getElementById('last-opponent-race'),
  lastOpponentRaceIcon: document.getElementById('last-opponent-race-icon'),
  lastGameResult: document.getElementById('last-game-result'),
  lastGameTime: document.getElementById('last-game-time'),
  currentStatus: document.getElementById('current-status'),
  lastGameContainer: document.getElementById('last-game-container'),
  noGame: document.querySelector('.no-game'),
  gameInfo: document.querySelector('.game-info')
};

// Estado da aplicação
let appState = {
  connected: false,
  inGame: false,
  currentScreen: 'Unknown',
  config: null
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
    case 'Zerg': return '<i class="fas fa-bug"></i>';
    case 'Terr': return '<i class="fas fa-rocket"></i>';
    case 'Prot': return '<i class="fas fa-atom"></i>';
    case 'random': return '<i class="fas fa-dice"></i>';
    default: return '';
  }
}

function updateStatus(status, message) {
  elements.statusIcon.className = status;
  elements.statusText.textContent = message;
  elements.currentStatus.textContent = message;
  
  if (status === 'ingame') {
    elements.currentStatus.classList.add('pulse');
  } else {
    elements.currentStatus.classList.remove('pulse');
  }
}

// Funções de atualização da interface
function updateStats(stats) {
  if (!stats) return;
  
  // Estatísticas gerais
  elements.totalGames.textContent = stats.total.games;
  elements.totalWins.textContent = stats.total.wins;
  elements.totalLosses.textContent = stats.total.losses;
  
  // Calcular porcentagem de vitórias
  const winPercentage = stats.total.games > 0 
    ? Math.round((stats.total.wins / stats.total.games) * 100) 
    : 0;
  elements.winPercentage.textContent = `${winPercentage}%`;
  
  // Estatísticas por raça
  elements.zergWins.textContent = stats.byRace.Zerg.wins;
  elements.zergLosses.textContent = stats.byRace.Zerg.losses;
  
  elements.terranWins.textContent = stats.byRace.Terr.wins;
  elements.terranLosses.textContent = stats.byRace.Terr.losses;
  
  elements.protossWins.textContent = stats.byRace.Prot.wins;
  elements.protossLosses.textContent = stats.byRace.Prot.losses;
  
  elements.randomWins.textContent = stats.byRace.random.wins;
  elements.randomLosses.textContent = stats.byRace.random.losses;
  
  // Último jogo
  if (stats.lastGame) {
    elements.noGame.classList.add('hidden');
    elements.gameInfo.classList.remove('hidden');
    
    elements.lastOpponentName.textContent = stats.lastGame.opponent.name || 'Desconhecido';
    elements.lastOpponentRace.textContent = stats.lastGame.opponent.race || 'Desconhecido';
    elements.lastOpponentRaceIcon.innerHTML = getRaceIcon(stats.lastGame.opponent.race);
    
    elements.lastGameResult.textContent = stats.lastGame.result;
    elements.lastGameResult.className = stats.lastGame.result === 'Victory' ? 'victory' : 'defeat';
    
    elements.lastGameTime.textContent = formatTimeAgo(stats.lastGame.timestamp);
  } else {
    elements.noGame.classList.remove('hidden');
    elements.gameInfo.classList.add('hidden');
  }
}

// Carregar configuração
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    appState.config = await response.json();
    
    // Atualizar título
    if (appState.config.overlay.title) {
      elements.panelTitle.textContent = appState.config.overlay.title;
    }
    
    // Aplicar tema
    if (appState.config.overlay.theme === 'light') {
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
  if (data.players && data.players.length >= 1) {
    opponentName = data.players[0].name;
  }
  
  updateStatus('ingame', `Em jogo contra ${opponentName}`);
});

socket.on('gameEnded', (data) => {
  console.log('Partida finalizada:', data);
  appState.inGame = false;
  updateStatus('online', 'Jogo finalizado');
});

socket.on('replayStarted', (data) => {
  console.log('Replay iniciado:', data);
  appState.inGame = true;
  updateStatus('ingame', 'Assistindo replay');
});

socket.on('screenChanged', (data) => {
  console.log('Tela alterada:', data);
  appState.currentScreen = data.toScreen;
  
  if (data.toScreen === 'InGame') {
    appState.inGame = true;
    updateStatus('ingame', 'Em jogo');
  } else {
    appState.inGame = false;
    updateStatus('online', `Na tela ${data.toScreen}`);
  }
});

socket.on('statsUpdated', (stats) => {
  console.log('Estatísticas atualizadas:', stats);
  updateStats(stats);
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  console.log('Overlay iniciado');
  updateStatus('offline', 'Aguardando conexão');
});