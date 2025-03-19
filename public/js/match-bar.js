// Conectar ao Socket.IO
const socket = io();

// Elementos da interface
const elements = {
  replayBadge: document.getElementById('replay-badge'),
  player1Name: document.getElementById('player1-name'),
  player1Race: document.getElementById('player1-race'),
  player2Name: document.getElementById('player2-name'),
  player2Race: document.getElementById('player2-race')
};

// Estado da aplicação
let appState = {
  connected: false,
  inGame: false,
  isReplay: false,
  currentGame: null,
  config: null,
  playerId: null
};

// Carregar configuração
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    appState.config = await response.json();
    appState.playerId = appState.config.player?.id;
    
    console.log('Configuração carregada:', appState.config);
    
    // Se já temos dados de jogo, atualize a interface
    if (appState.currentGame) {
      updateMatchInterface(appState.currentGame);
    }
  } catch (error) {
    console.error('Erro ao carregar configuração:', error);
  }
}

// Configurar ícones de raça
function getRaceClass(race) {
  switch (race) {
    case 'Zerg': return 'zerg';
    case 'Terr': return 'terran';
    case 'Prot': return 'protoss';
    case 'random': return 'random';
    default: return '';
  }
}

function getRaceIcon(race) {
  switch (race) {
    case 'Zerg': return '<i class="fas fa-bug"></i>';
    case 'Terr': return '<i class="fas fa-rocket"></i>';
    case 'Prot': return '<i class="fas fa-atom"></i>';
    case 'random': return '<i class="fas fa-dice"></i>';
    default: return '<i class="fas fa-question"></i>';
  }
}

// Atualizar interface da partida
function updateMatchInterface(gameData) {
  if (!gameData || !gameData.players || gameData.players.length === 0) {
    return;
  }
  
  // Verificar se é um replay
  appState.isReplay = gameData.isReplay;
  
  if (appState.isReplay) {
    elements.replayBadge.classList.remove('hidden');
  } else {
    elements.replayBadge.classList.add('hidden');
  }
  
  // Encontrar jogador e oponente
  let player1, player2;
  
  if (appState.playerId) {
    // Se temos o ID do jogador, identificamos corretamente
    player1 = gameData.players.find(p => p.id === appState.playerId);
    player2 = gameData.players.find(p => p.id !== appState.playerId);
  } else {
    // Caso contrário, apenas pegamos os dois primeiros jogadores
    [player1, player2] = gameData.players;
  }
  
  // Atualizar nomes e raças
  if (player1) {
    elements.player1Name.textContent = player1.name || 'Player 1';
    elements.player1Race.innerHTML = getRaceIcon(player1.race);
    elements.player1Race.className = `player-race ${getRaceClass(player1.race)}`;
  }
  
  if (player2) {
    elements.player2Name.textContent = player2.name || 'Player 2';
    elements.player2Race.innerHTML = getRaceIcon(player2.race);
    elements.player2Race.className = `player-race ${getRaceClass(player2.race)}`;
  }
}

// Esconder a barra quando não estiver em jogo
function updateVisibility(isVisible) {
  const container = document.querySelector('.match-bar-container');
  
  if (isVisible) {
    container.style.display = 'flex';
    container.classList.add('fade-in');
  } else {
    container.style.display = 'none';
    container.classList.remove('fade-in');
  }
}

// Eventos do Socket.IO
socket.on('connect', () => {
  console.log('Conectado ao servidor');
  appState.connected = true;
  
  // Carregar configuração
  loadConfig();
  
  // Verificar estado do jogo atual
  fetch('/api/game')
    .then(response => response.json())
    .then(gameData => {
      if (gameData && (gameData.players?.length > 0)) {
        appState.currentGame = gameData;
        appState.inGame = true;
        updateMatchInterface(gameData);
        updateVisibility(true);
      } else {
        updateVisibility(false);
      }
    })
    .catch(error => {
      console.error('Erro ao obter estado do jogo:', error);
    });
});

socket.on('disconnect', () => {
  console.log('Desconectado do servidor');
  appState.connected = false;
});

socket.on('gameStarted', (data) => {
  console.log('Partida iniciada:', data);
  appState.inGame = true;
  appState.currentGame = data;
  updateMatchInterface(data);
  updateVisibility(true);
});

socket.on('gameEnded', (data) => {
  console.log('Partida finalizada:', data);
  // Mantenha os dados para mostrar o resultado, mas esconda após alguns segundos
  setTimeout(() => {
    appState.inGame = false;
    updateVisibility(false);
  }, 5000);
});

socket.on('replayStarted', (data) => {
  console.log('Replay iniciado:', data);
  appState.inGame = true;
  appState.currentGame = data;
  updateMatchInterface(data);
  updateVisibility(true);
});

socket.on('screenChanged', (data) => {
  console.log('Tela alterada:', data);
  
  if (data.toScreen === 'InGame') {
    appState.inGame = true;
    updateVisibility(true);
  } else {
    // Se não estiver no jogo, esconda a barra após um pequeno atraso
    setTimeout(() => {
      appState.inGame = false;
      updateVisibility(false);
    }, 1000);
  }
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  console.log('Match Bar iniciada');
  updateVisibility(false); // Inicialmente escondida
});