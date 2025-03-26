const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

// Função para determinar o caminho base (funciona tanto em desenvolvimento quanto empacotado)
function getBasePath() {
  // Se empacotado com PKG
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  // Em desenvolvimento
  return process.cwd();
}

// Função para carregar a configuração
function loadConfig() {
  const basePath = getBasePath();
  const configPath = path.join(basePath, 'config.yaml');

  try {
    // Verificar se o arquivo de configuração existe
    if (!fs.existsSync(configPath)) {
      // Se não existir, criar a partir do exemplo
      const examplePath = path.join(basePath, 'config.yaml.example');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, configPath);
        console.log('Arquivo config.yaml criado a partir do exemplo.');
      } else {
        throw new Error('Arquivo config.yaml.example não encontrado.');
      }
    }

    // Carregar o arquivo de configuração
    const configFile = fs.readFileSync(configPath, 'utf8');
    return yaml.load(configFile);
  } catch (error) {
    console.error('Erro ao carregar configuração:', error);
    process.exit(1);
  }
}

// Ajustar caminhos de armazenamento para funcionarem com o executável
function adjustStoragePaths(config) {
  const basePath = getBasePath();

  // Garantir que o diretório de dados exista
  const dataDir = path.join(basePath, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Ajustar caminhos no config
  if (config.storage) {
    if (config.storage.stats_file) {
      config.storage.stats_file = path.join(basePath, config.storage.stats_file);
    }
    if (config.storage.database_path) {
      config.storage.database_path = path.join(basePath, config.storage.database_path);
    }
  }

  return config;
}

// Carregar configuração
const configRaw = loadConfig();
const config = adjustStoragePaths(configRaw);

// Importar módulos
const SC2Monitor = require('./src/sc2monitor');
const StatsTracker = require('./src/statsTracker');
const Database = require('./src/db');

// Inicializar aplicação
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Determinar o caminho da pasta public
function getPublicPath() {
  if (process.pkg) {
    // Em produção (executável), o diretório public está ao lado do executável
    return path.join(path.dirname(process.execPath), 'public');
  }
  // Em desenvolvimento
  return path.join(process.cwd(), 'public');
}

// Servir arquivos estáticos
app.use(express.static(getPublicPath()));

// Organização de rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'index.html'));
});

// Rota para o painel de estatísticas
app.get('/stats-dashboard', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'stats-dashboard.html'));
});

// Rota para a barra de partida
app.get('/match-bar', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'match-bar.html'));
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

// Rota para obter partidas recentes
app.get('/api/matches/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const matches = await database.getRecentMatches(limit);
    res.json(matches);
  } catch (error) {
    console.error('Erro ao obter partidas recentes:', error);
    res.status(500).json({ error: 'Erro ao obter partidas recentes' });
  }
});

// Inicializar rastreador de estatísticas
const statsTracker = new StatsTracker(config);

// Inicializar banco de dados
const database = new Database(config);
database.initialize().then(success => {
  if (success) {
    console.log('Banco de dados inicializado com sucesso');

    // Carregar estatísticas do banco para o rastreador, se disponíveis
    database.getMatchStats().then(dbStats => {
      if (dbStats) {
        statsTracker.setStats(dbStats);
        console.log('Estatísticas carregadas do banco de dados');
      }
    }).catch(err => {
      console.error('Erro ao carregar estatísticas do banco:', err);
    });
  } else {
    console.warn('Usando armazenamento de estatísticas apenas em arquivo JSON');
  }
});

// Inicializar monitor SC2
const sc2Monitor = new SC2Monitor(config);

// Manipular eventos do SC2
sc2Monitor.on('gameStarted', (data) => {
  console.log('Partida iniciada:', data);
  io.emit('gameStarted', data);
});

sc2Monitor.on('gameEnded', (data) => {
  console.log('Partida finalizada:', data);

  // Registrar estatísticas no rastreador
  statsTracker.recordGameEnd(data);

  // Registrar partida no banco de dados
  if (database.connected && data.myPlayer) {
    const opponent = data.players.find(p => p.name !== data.myPlayer.name);

    if (opponent) {
      database.recordMatch({
        playerName: data.myPlayer.name,
        opponentName: opponent.name,
        playerRace: data.myPlayer.race,
        opponentRace: opponent.race,
        result: data.myPlayer.result,
        isReplay: false,
        rawData: JSON.stringify(data)
      }).then(id => {
        if (id) {
          console.log(`Partida registrada no banco de dados com ID: ${id}`);
        }
      }).catch(err => {
        console.error('Erro ao registrar partida no banco de dados:', err);
      });
    }
  }

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

sc2Monitor.on('sc2Connected', () => {
  console.log('Conectado ao cliente SC2');
  io.emit('sc2Connected');
});

sc2Monitor.on('sc2Disconnected', () => {
  console.log('Desconectado do cliente SC2');
  io.emit('sc2Disconnected');
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

// Tratamento para encerramento gracioso
process.on('SIGINT', async () => {
  console.log('Encerrando aplicação...');

  // Fechar conexão com o banco de dados
  if (database) {
    await database.close();
  }

  process.exit(0);
});

// Iniciar servidor
const PORT = config.server.port || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);

  // Mostrar mensagem amigável para o usuário em caso de executável standalone
  if (process.pkg) {
    console.log('------------------------------------------------');
    console.log('SC2 Stream Overlay iniciado com sucesso!');
    console.log('O overlay está disponível nos seguintes endereços:');
    console.log(`- Página inicial: http://localhost:${PORT}`);
    console.log(`- Painel de estatísticas: http://localhost:${PORT}/stats-dashboard`);
    console.log(`- Barra de partida: http://localhost:${PORT}/match-bar`);
    console.log('------------------------------------------------');
    console.log('IMPORTANTE: Certifique-se de que o StarCraft II esteja rodando');
    console.log('com a Client API ativada: "SC2Switcher.exe -clientapi 6119"');
    console.log('------------------------------------------------');
  }
});