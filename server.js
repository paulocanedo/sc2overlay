const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const crypto = require('crypto');
const TwitchAuth = require('./src/twitchAuth');
const TwitchAPI = require('./src/twitchApi');

// Middleware para verificar se a Twitch está configurada
function checkTwitchConfig(req, res, next) {
  if (!config.twitch || !config.twitch.enabled) {
    return res.status(403).json({ error: 'Integração com a Twitch não está habilitada. Verifique o arquivo config.yaml.' });
  }

  if (!config.twitch.client_id || !config.twitch.client_secret) {
    return res.status(403).json({ error: 'Credenciais da Twitch não configuradas. Verifique o arquivo config.yaml.' });
  }

  next();
}

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
    // Em produção (executável), o diretório public está embutido no executável
    return path.join(__dirname, 'public');
  }
  // Em desenvolvimento
  return path.join(process.cwd(), 'public');
}

// Inicializar autenticação da Twitch
const twitchAuth = new TwitchAuth(config);

// Inicializar API da Twitch
const twitchApi = new TwitchAPI(twitchAuth, config);

// Armazenar estados de autenticação para segurança
const authStates = new Map();

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

  // Garantir que a opacidade tenha um valor padrão se não estiver definida
  if (clientConfig.overlay && clientConfig.overlay.bg_opacity === undefined) {
    clientConfig.overlay.bg_opacity = 0.95; // Valor padrão
  }

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

// Rota para obter dados da Twitch
app.get('/api/twitch/stats', async (req, res) => {
  try {
    // Em uma implementação real, aqui teríamos código para acessar
    // a API da Twitch usando as credenciais configuradas

    // Por enquanto, retornamos dados de demonstração
    const mockData = {
      subscribers: Math.floor(Math.random() * 1000) + 100,
      viewers: Math.floor(Math.random() * 500) + 10,
      isLive: Math.random() > 0.3
    };

    res.json(mockData);
  } catch (error) {
    console.error('Erro ao obter dados da Twitch:', error);
    res.status(500).json({ error: 'Erro ao obter dados da Twitch' });
  }
});

// Rota para obter configuração da Twitch
app.get('/api/twitch/config', (req, res) => {
  // Enviar apenas configurações públicas (sem secrets)
  const twitchConfig = {
    enabled: config.twitch?.enabled || false,
    channelName: config.twitch?.channel_name || '',
    updateInterval: config.twitch?.update_interval || 60000
  };

  res.json(twitchConfig);
});

// Rota para obter URL de autorização da Twitch
app.get('/api/twitch/auth-url', checkTwitchConfig, (req, res) => {
  // Gerar estado único para esta sessão
  const state = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutos de validade

  // Armazenar estado para validação posterior
  authStates.set(state, { expiresAt });

  // Gerar URL de autorização
  const authUrl = twitchAuth.generateAuthUrl(state);

  res.json({ url: authUrl, state });
});

// Rota de callback para autorização OAuth da Twitch
app.get('/auth/twitch/callback', checkTwitchConfig, async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Verificar erro
  if (error) {
    console.error(`Erro na autenticação Twitch: ${error} - ${error_description}`);
    return res.send(`
      <html>
        <head>
          <title>Erro de Autenticação</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            .error { color: #e53935; }
            .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                     background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h2>Falha na Autenticação Twitch</h2>
          <p class="error">${error}: ${error_description}</p>
          <a class="button" href="/">Voltar ao Início</a>
        </body>
      </html>
    `);
  }

  // Verificar estado
  if (!state || !authStates.has(state)) {
    return res.status(400).send(`
      <html>
        <head>
          <title>Erro de Autenticação</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            .error { color: #e53935; }
            .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                     background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h2>Falha na Autenticação Twitch</h2>
          <p class="error">Estado de autenticação inválido. Isso pode ser uma tentativa de falsificação.</p>
          <a class="button" href="/">Voltar ao Início</a>
        </body>
      </html>
    `);
  }

  // Verificar se o estado expirou
  const stateData = authStates.get(state);
  if (stateData.expiresAt < Date.now()) {
    authStates.delete(state);
    return res.status(400).send(`
      <html>
        <head>
          <title>Erro de Autenticação</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            .error { color: #e53935; }
            .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                     background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h2>Falha na Autenticação Twitch</h2>
          <p class="error">O código de autorização expirou. Por favor, tente novamente.</p>
          <a class="button" href="/">Voltar ao Início</a>
        </body>
      </html>
    `);
  }

  // Remover estado usado
  authStates.delete(state);

  try {
    // Trocar código por tokens
    const success = await twitchAuth.handleCallback(code, state);

    if (success) {
      // Atualizar estatísticas imediatamente
      try {
        await twitchApi.updateStats();
      } catch (err) {
        console.error('Erro ao atualizar estatísticas após autorização:', err);
      }

      // Retornar página de sucesso
      return res.send(`
        <html>
          <head>
            <title>Autorização Concluída</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
              .success { color: #43a047; }
              .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                       background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
            </style>
          </head>
          <body>
            <h2>Autorização Twitch Concluída</h2>
            <p class="success">Seu overlay agora está conectado à sua conta da Twitch!</p>
            <a class="button" href="/">Voltar ao Início</a>
            <script>
              // Fechar a janela automaticamente após 5 segundos se for uma janela pop-up
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage('twitch-auth-success', '*');
                  window.close();
                }
              }, 5000);
            </script>
          </body>
        </html>
      `);
    } else {
      return res.status(500).send(`
        <html>
          <head>
            <title>Erro de Autenticação</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
              .error { color: #e53935; }
              .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                       background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
            </style>
          </head>
          <body>
            <h2>Falha na Autenticação Twitch</h2>
            <p class="error">Não foi possível obter os tokens de acesso. Por favor, tente novamente mais tarde.</p>
            <a class="button" href="/">Voltar ao Início</a>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Erro ao processar callback da Twitch:', error);
    return res.status(500).send(`
      <html>
        <head>
          <title>Erro de Autenticação</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            .error { color: #e53935; }
            .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                     background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h2>Falha na Autenticação Twitch</h2>
          <p class="error">Ocorreu um erro no servidor: ${error.message}</p>
          <a class="button" href="/">Voltar ao Início</a>
        </body>
      </html>
    `);
  }
});

// Rota para verificar status da autenticação Twitch
app.get('/api/twitch/auth-status', async (req, res) => {
  try {
    const isEnabled = !!(config.twitch && config.twitch.enabled);
    const isConfigured = !!(config.twitch && config.twitch.client_id && config.twitch.client_secret);
    const isAuthorized = twitchAuth.isAuthorized();

    let validationResult = null;

    if (isAuthorized) {
      validationResult = await twitchAuth.validateToken();
    }

    res.json({
      enabled: isEnabled,
      configured: isConfigured,
      authorized: isAuthorized,
      valid: validationResult ? validationResult.valid : false,
      channel: config.twitch?.channel_name || '',
      userName: validationResult ? validationResult.login : null,
      scopes: validationResult ? validationResult.scopes : []
    });
  } catch (error) {
    console.error('Erro ao obter status de autenticação:', error);
    res.status(500).json({ error: 'Erro ao verificar status de autenticação da Twitch' });
  }
});

// Rota para revogar autorização Twitch
app.post('/api/twitch/revoke', async (req, res) => {
  try {
    const success = await twitchAuth.revokeAccess();
    res.json({ success });
  } catch (error) {
    console.error('Erro ao revogar acesso da Twitch:', error);
    res.status(500).json({ error: 'Erro ao revogar acesso da Twitch' });
  }
});

// Rota para obter estatísticas da Twitch
app.get('/api/twitch/stats', async (req, res) => {
  try {
    // Verificar se a Twitch está habilitada
    if (!config.twitch || !config.twitch.enabled) {
      return res.json({ enabled: false });
    }

    // Verificar se estamos autorizados
    if (!twitchAuth.isAuthorized()) {
      return res.json({
        enabled: true,
        authorized: false,
        message: 'Não autorizado na Twitch'
      });
    }

    // Se os dados do cache são recentes (menos de 30 segundos), retornar diretamente
    const stats = twitchApi.getStats();
    const isCacheRecent = stats.lastUpdated && (Date.now() - stats.lastUpdated < 30000);

    if (isCacheRecent) {
      return res.json({
        enabled: true,
        authorized: true,
        ...stats
      });
    }

    // Caso contrário, atualizar e retornar
    const updatedStats = await twitchApi.updateStats();
    res.json({
      enabled: true,
      authorized: true,
      ...updatedStats
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas da Twitch:', error);
    res.status(500).json({
      error: 'Erro ao obter estatísticas da Twitch',
      message: error.message
    });
  }
});

// Adicionar listener para eventos de estatísticas da Twitch
twitchApi.on('statsUpdated', (stats) => {
  // Emitir evento para todos os clientes conectados
  io.emit('twitchStatsUpdated', stats);
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
        timestamp: data.timestamp,
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

sc2Monitor.on('replayEnded', (data) => {
  console.log('Replay finalizado:', data);
  io.emit('replayEnded', data);
});

sc2Monitor.on('screenEntered', (data) => {
  console.log(`Entrando na tela: ${data.toScreen}`);
  io.emit('screenEntered', data);
});

sc2Monitor.on('screenExited', (data) => {
  console.log(`Saindo da tela: ${data.fromScreen}`);
  io.emit('screenExited', data);
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