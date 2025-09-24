const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const TwitchAuth = require('./src/twitchAuth');
const TwitchAPI = require('./src/twitchApi');

// Helpers
const { getBasePath, loadConfig, adjustStoragePaths, getPublicPath } = require('./src/utils/config-utils');

// Carregar configuração
const configRaw = loadConfig();
const config = adjustStoragePaths(configRaw);

// Inicializar aplicação
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos
app.use(express.static(getPublicPath()));

// Importar módulos
const SC2Monitor = require('./src/sc2monitor');
const StatsTracker = require('./src/statsTracker');
const Database = require('./src/db');

// Inicializar componentes principais
// Eles devem ser inicializados ANTES de serem usados nas rotas
const database = new Database(config);
const statsTracker = new StatsTracker(config);
const sc2Monitor = new SC2Monitor(config);

// Inicializar autenticação da Twitch
const twitchAuth = new TwitchAuth(config);

// Inicializar API da Twitch
const twitchApi = new TwitchAPI(twitchAuth, config);

// Armazenar estados de autenticação para segurança
const authStates = new Map();

// APÓS inicializar todos os componentes necessários, carregamos as rotas
// Importar rotas
const pageRoutes = require('./src/routes/pages')(getPublicPath());
const apiRoutes = require('./src/routes/api')(config, statsTracker, sc2Monitor, database);
const twitchRoutes = require('./src/routes/twitch')(config, twitchAuth, twitchApi, authStates);
const configRoutes = require('./src/routes/config')(path.join(getBasePath(), 'config.yaml'), config);

// Montar rotas
app.use('/', pageRoutes);
app.use('/api', apiRoutes);
app.use('/api/twitch', twitchRoutes);
app.use('/api/config', configRoutes);
app.use('/auth/twitch', require('./src/routes/twitch-auth')(config, twitchAuth, twitchApi, authStates));

// Configurar eventos do SC2
require('./src/events/sc2-events')(sc2Monitor, io, statsTracker, database);

// Adicionar listener para eventos de estatísticas da Twitch
twitchApi.on('statsUpdated', (stats) => {
  // Emitir evento para todos os clientes conectados
  io.emit('twitchStatsUpdated', stats);
});

// Inicializar banco de dados
database.initialize().then(success => {
  if (success) {
    console.log('Banco de dados inicializado com sucesso');

    // Carregar estatísticas do banco para o rastreador, se disponíveis
    // Nota: Aqui carregamos sem filtro para manter o comportamento inicial padrão
    // O filtro será aplicado dinamicamente via API conforme a configuração do usuário
    database.getMatchStats().then(dbStats => {
      if (dbStats) {
        statsTracker.setStats(dbStats);
        console.log('Estatísticas carregadas do banco de dados (todas as partidas)');
      }
    }).catch(err => {
      console.error('Erro ao carregar estatísticas do banco:', err);
    });
  } else {
    console.warn('Usando armazenamento de estatísticas apenas em arquivo JSON');
  }
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