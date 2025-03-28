const fs = require('fs').promises;
const path = require('path');

class StatsTracker {
  constructor(config) {
    this.config = config;
    this.statsFile = config.storage.stats_file;
    this.playerName = config.player.name;
    this.exactMatch = config.player.exact_match !== false; // Por padrão, true se não especificado
    this.stats = {
      total: {
        games: 0,
        wins: 0,
        losses: 0
      },
      byRace: {
        Terr: { games: 0, wins: 0, losses: 0 },
        Prot: { games: 0, wins: 0, losses: 0 },
        Zerg: { games: 0, wins: 0, losses: 0 },
        random: { games: 0, wins: 0, losses: 0 }
      },
      lastGame: null
    };

    // Carregar estatísticas salvas
    this.loadStats();

    // Configurar salvamento automático
    if (config.overlay.auto_save) {
      setInterval(() => this.saveStats(), config.overlay.save_interval);
    }
  }

  // Adicionar método para definir estatísticas a partir do banco de dados
  setStats(newStats) {
    if (newStats && typeof newStats === 'object') {
      this.stats = newStats;
      console.log('Estatísticas atualizadas externamente');
      // Salvar as estatísticas no arquivo também
      this.saveStats();
    }
  }

  async loadStats() {
    try {
      // Garantir que o diretório existe
      await fs.mkdir(path.dirname(this.statsFile), { recursive: true });

      // Tentar carregar o arquivo
      const data = await fs.readFile(this.statsFile, 'utf8');
      this.stats = JSON.parse(data);
      console.log('Estatísticas carregadas com sucesso');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('Arquivo de estatísticas não existe, usando valores padrão');
        await this.saveStats();
      } else {
        console.error('Erro ao carregar estatísticas:', error);
      }
    }
  }

  async saveStats() {
    try {
      // Garantir que o diretório existe
      await fs.mkdir(path.dirname(this.statsFile), { recursive: true });

      // Salvar o arquivo
      await fs.writeFile(this.statsFile, JSON.stringify(this.stats, null, 2));
      console.log('Estatísticas salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar estatísticas:', error);
    }
  }

  recordGameEnd(gameData) {
    // Verificar se é uma partida válida para registro
    if (!gameData || !gameData.players || gameData.players.length === 0) {
      console.log('Dados de jogo inválidos, não registrando');
      return;
    }

    // Se o myPlayer foi identificado explicitamente pelo monitor
    if (gameData.myPlayer) {
      this.processGameResult(gameData.myPlayer, gameData.players, gameData.timestamp);
      return;
    }

    // Caso contrário, tentar encontrar o jogador pelo nome
    const myPlayer = this.findMyPlayer(gameData.players);

    if (!myPlayer) {
      console.warn('⚠️ JOGADOR NÃO IDENTIFICADO - ESTATÍSTICAS NÃO REGISTRADAS ⚠️');
      console.warn(`Não foi possível encontrar um jogador com nome "${this.playerName}" entre os jogadores da partida.`);
      console.warn('Verifique o arquivo config.yaml e ajuste o nome do jogador ou desative a correspondência exata.');
      console.warn('Jogadores na partida:', gameData.players.map(p => p.name).join(', '));
      return;
    }

    this.processGameResult(myPlayer, gameData.players, gameData.timestamp);
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
      return null;
    }

    if (possibleMatches.length > 1) {
      console.warn(`Encontrados múltiplos jogadores com nome similar a "${this.playerName}". Usando o primeiro.`);
    }

    return possibleMatches[0];
  }

  processGameResult(myPlayer, allPlayers, timestamp) {
    // Encontrar o oponente (qualquer jogador que não seja eu)
    const opponent = allPlayers.find(p => p.name !== myPlayer.name);

    if (!opponent) {
      console.log('Não foi possível identificar o oponente, não registrando');
      return;
    }

    // Determinar se o jogador venceu baseado no resultado do seu próprio jogador
    const win = myPlayer.result === 'Victory';

    console.log(`Resultado da partida para ${myPlayer.name}: ${myPlayer.result}`);
    console.log(`Resultado registrado como: ${win ? 'Vitória' : 'Derrota'}`);

    // Atualizar estatísticas totais
    this.stats.total.games++;
    if (win) {
      this.stats.total.wins++;
    } else {
      this.stats.total.losses++;
    }

    // Atualizar estatísticas por raça
    const opponentRace = opponent.race || 'random';
    this.stats.byRace[opponentRace].games++;
    if (win) {
      this.stats.byRace[opponentRace].wins++;
    } else {
      this.stats.byRace[opponentRace].losses++;
    }

    // Registrar último jogo
    this.stats.lastGame = {
      timestamp: timestamp || new Date().toISOString(),
      myPlayer: myPlayer,
      opponent: opponent,
      result: win ? 'Victory' : 'Defeat'
    };

    // Salvar estatísticas
    this.saveStats();

    console.log(`Jogo registrado: ${win ? 'Vitória' : 'Derrota'} contra ${opponent.name} (${opponent.race})`);
  }

  getStats() {
    return this.stats;
  }
}

module.exports = StatsTracker;