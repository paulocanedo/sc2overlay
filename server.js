const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

// Carregar configuração
const configFile = fs.readFileSync('./config.yaml', 'utf8');
const config = yaml.load(configFile);

// Importar módulos
const SC2Monitor = require('./src/sc2monitor');
const StatsTracker = require('./src/statsTracker');

// Inicializar aplicação
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Organização de rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para o painel de estatísticas
app.get('/stats-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stats-dashboard.html'));
});

// Rota para a barra de partida
app.get('/match-bar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'match-bar.html'));
});

// Rota para obter configuração
app.get('/api/config', (req, res) => {
  // Enviar apenas configurações seguras (sem secrets)
  const clientConfig = {
    overlay: config.overlay,
    player: {
      id: config.player.id,
      name: config.player.name
    }
  };
  res.json(clientConfig);
});

// Rota para obter estatísticas
app.get('/api/stats', (req, res) => {
  res.json(statsTracker.getStats());
});

// Rota para obter o estado atual do jogo
app.get('/api/game', (req, res) => {
  if (sc2Monitor.currentGame) {
    res.json(sc2Monitor.currentGame);
  } else {
    res.json({ players: [] });
  }
});

// Rota para obter status do servidor
app.get('/api/status', (req, res) => {
  res.json({
    connected: sc2Monitor.isConnected || false,
    inGame: sc2Monitor.isInGame || false,
    port: config.server.port,
    uptime: process.uptime()
  });
});

// Inicializar rastreador de estatísticas
const statsTracker = new StatsTracker(config);

// Inicializar monitor SC2
const sc2Monitor = new SC2Monitor(config);

// Manipular eventos do SC2
sc2Monitor.on('gameStarted', (data) => {
  console.log('Partida iniciada:', data);
  io.emit('gameStarted', data);
});

sc2Monitor.on('gameEnded', (data) => {
  console.log('Partida finalizada:', data);
  // Registrar estatísticas
  statsTracker.recordGameEnd(data);
  // Enviar estatísticas atualizadas
  io.emit('gameEnded', data);
  io.emit('statsUpdated', statsTracker.getStats());
});

sc2Monitor.on('replayStarted', (data) => {
  console.log('Replay iniciado:', data);
  io.emit('replayStarted', data);
});

sc2Monitor.on('screenChanged', (data) => {
  console.log(`Tela alterada: ${data.fromScreen} -> ${data.toScreen}`);
  io.emit('screenChanged', data);
});

// Socket.IO para comunicação em tempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado');
  
  // Enviar estatísticas atuais para o cliente que acabou de conectar
  socket.emit('statsUpdated', statsTracker.getStats());
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// Iniciar servidor
const PORT = config.server.port;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});