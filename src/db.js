const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs').promises;

class DB {
  constructor(config) {
    this.config = config;
    this.dbPath = path.resolve(config.storage.database_path || './data/sc2stats.db');
    this.db = null;
    this.connected = false;
  }

  async initialize() {
    try {
      // Garantir que o diretório existe
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

      // Abrir conexão com o banco de dados
      this.db = new Database(this.dbPath, {
        verbose: console.log
      });

      console.log(`Banco de dados inicializado em: ${this.dbPath}`);
      this.connected = true;

      // Criar tabelas se não existirem
      await this.createTables();

      return true;
    } catch (error) {
      console.error('Erro ao inicializar banco de dados:', error);
      return false;
    }
  }

  async createTables() {
    try {
      // Tabela de partidas
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS matches (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             timestamp TEXT NOT NULL,
                                             player_name TEXT NOT NULL,
                                             opponent_name TEXT NOT NULL,
                                             player_race TEXT NOT NULL,
                                             opponent_race TEXT NOT NULL,
                                             result TEXT NOT NULL,
                                             map_name TEXT,
                                             game_length INTEGER,
                                             raw_data TEXT
        )
      `);

      // Índices
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_matches_timestamp ON matches (timestamp);
        CREATE INDEX IF NOT EXISTS idx_matches_opponent_race ON matches (opponent_race);
        CREATE INDEX IF NOT EXISTS idx_matches_result ON matches (result);
      `);

      console.log('Tabelas criadas/verificadas com sucesso');
    } catch (error) {
      console.error('Erro ao criar tabelas:', error);
      throw error;
    }
  }

  async recordMatch(matchData) {
    if (!this.connected || !this.db) {
      console.error('Banco de dados não está conectado');
      return false;
    }

    try {
      const {
        timestamp = new Date().toISOString(),
        playerName,
        opponentName,
        playerRace,
        opponentRace,
        result,
        mapName = null,
        gameLength = null,
        rawData = null
      } = matchData;

      if (result === 'Undecided') {
        console.warn(`Resultado da partida entre ${playerName} e ${opponentName} está Undecided, ignorando no db`);
        return false;
      }

      const stmt = this.db.prepare(`
        INSERT INTO matches (
          timestamp, player_name, opponent_name, player_race, opponent_race,
          result, map_name, game_length, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertResult = stmt.run(
          timestamp,
          playerName,
          opponentName,
          playerRace,
          opponentRace,
          result,
          mapName,
          gameLength,
          rawData ? rawData : null
      );

      console.log(`Partida registrada no banco de dados com ID: ${insertResult.lastInsertRowid}`);
      return insertResult.lastInsertRowid;
    } catch (error) {
      console.error('Erro ao registrar partida no banco de dados:', error);
      return false;
    }
  }

  async getMatchStats(timeFilter = null) {
    if (!this.connected || !this.db) {
      console.error('Banco de dados não está conectado');
      return null;
    }

    try {
      // Log para depuração
      if (timeFilter) {
        console.log('Consultando estatísticas do banco de dados com filtro:', timeFilter);
      } else {
        console.log('Consultando estatísticas do banco de dados sem filtro');
      }
      
      // Preparar condição WHERE para filtro de tempo
      let timeCondition = '';
      let timeParams = [];
      
      if (timeFilter) {
        const { startDate, endDate } = timeFilter;
        
        if (startDate && endDate) {
          timeCondition = 'WHERE timestamp BETWEEN ? AND ?';
          timeParams = [startDate, endDate];
          console.log(`Aplicando filtro de tempo: ${startDate} até ${endDate}`);
        } else if (startDate) {
          timeCondition = 'WHERE timestamp >= ?';
          timeParams = [startDate];
          console.log(`Aplicando filtro de tempo desde: ${startDate}`);
        } else if (endDate) {
          timeCondition = 'WHERE timestamp <= ?';
          timeParams = [endDate];
          console.log(`Aplicando filtro de tempo até: ${endDate}`);
        }
      }

      // Estatísticas gerais - consulta com detalhes
      const totalStatsStmt = this.db.prepare(`
        SELECT 
          COUNT(*) AS total_games,
          SUM(CASE WHEN result = 'Victory' THEN 1 ELSE 0 END) AS total_wins,
          SUM(CASE WHEN result = 'Defeat' THEN 1 ELSE 0 END) AS total_losses
        FROM matches
        ${timeCondition}
      `);

      const totalStats = totalStatsStmt.get(...timeParams);
      console.log(`Totais calculados: jogos=${totalStats.total_games}, vitórias=${totalStats.total_wins}, derrotas=${totalStats.total_losses}`);

      // Se não há jogos, retornar estrutura vazia mas válida
      if (totalStats.total_games === 0) {
        console.log('Nenhum jogo encontrado no período especificado');
        return {
          total: { games: 0, wins: 0, losses: 0 },
          byRace: {
            Zerg: { games: 0, wins: 0, losses: 0 },
            Terr: { games: 0, wins: 0, losses: 0 },
            Prot: { games: 0, wins: 0, losses: 0 },
            random: { games: 0, wins: 0, losses: 0 }
          },
          lastGame: null
        };
      }

      // Estatísticas por raça
      const raceStatsStmt = this.db.prepare(`
        SELECT 
          opponent_race,
          COUNT(*) AS games,
          SUM(CASE WHEN result = 'Victory' THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN result = 'Defeat' THEN 1 ELSE 0 END) AS losses
        FROM matches
        ${timeCondition}
        GROUP BY opponent_race
      `);

      const raceStats = raceStatsStmt.all(...timeParams);
      console.log('Estatísticas por raça encontradas:', raceStats.length, 'registros');
      raceStats.forEach(r => {
        console.log(`- ${r.opponent_race}: jogos=${r.games}, vitórias=${r.wins}, derrotas=${r.losses}`);
      });

      // Último jogo (dentro do filtro de tempo, se aplicável)
      const lastMatchStmt = this.db.prepare(`
        SELECT * FROM matches
        ${timeCondition}
        ORDER BY timestamp DESC
        LIMIT 1
      `);

      const lastMatch = lastMatchStmt.get(...timeParams);

      // Formatar as estatísticas para corresponder ao formato esperado
      const racesMap = {
        Zerg: { games: 0, wins: 0, losses: 0 },
        Terr: { games: 0, wins: 0, losses: 0 },
        Prot: { games: 0, wins: 0, losses: 0 },
        random: { games: 0, wins: 0, losses: 0 }
      };

      // Preencher estatísticas por raça
      raceStats.forEach(stat => {
        if (racesMap[stat.opponent_race]) {
          racesMap[stat.opponent_race] = {
            games: stat.games,
            wins: stat.wins,
            losses: stat.losses
          };
        }
      });

      // Preparar o objeto de estatísticas
      const stats = {
        total: {
          games: totalStats.total_games || 0,
          wins: totalStats.total_wins || 0,
          losses: totalStats.total_losses || 0
        },
        byRace: racesMap,
        lastGame: null
      };

      // Adicionar informações do último jogo, se existir
      if (lastMatch) {
        stats.lastGame = {
          timestamp: lastMatch.timestamp,
          myPlayer: {
            name: lastMatch.player_name,
            race: lastMatch.player_race
          },
          opponent: {
            name: lastMatch.opponent_name,
            race: lastMatch.opponent_race
          },
          result: lastMatch.result
        };
        console.log('Último jogo encontrado:', lastMatch.timestamp);
      } else {
        console.log('Nenhum último jogo encontrado no período');
      }

      console.log('Estatísticas finais:', {
        totalGames: stats.total.games,
        filtroAplicado: timeFilter ? 'Sim' : 'Não'
      });

      return stats;
    } catch (error) {
      console.error('Erro ao obter estatísticas do banco de dados:', error);
      return null;
    }
  }

  async getRecentMatches(limit = 10) {
    if (!this.connected || !this.db) {
      console.error('Banco de dados não está conectado');
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM matches
        ORDER BY timestamp DESC
          LIMIT ?
      `);

      const matches = stmt.all(limit);
      return matches;
    } catch (error) {
      console.error('Erro ao obter partidas recentes:', error);
      return [];
    }
  }

  async close() {
    if (this.db) {
      try {
        this.db.close();
        this.connected = false;
        console.log('Conexão com o banco de dados fechada');
      } catch (error) {
        console.error('Erro ao fechar conexão com o banco de dados:', error);
      }
    }
  }
}

// Função para criar filtro de tempo baseado na configuração
function createTimeFilterFromConfig(config) {
  if (!config || 
      !config.stats || 
      !config.stats.time_filter || 
      !config.stats.time_filter.enabled) {
    console.log('Filtro de tempo desabilitado ou não configurado');
    return null;
  }
  
  const filter = config.stats.time_filter;
  const now = new Date();
  
  console.log('Configuração de filtro encontrada:', filter);
  
  switch (filter.type) {
    case 'last_days':
      if (filter.value && filter.value > 0) {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - filter.value);
        const result = {
          startDate: startDate.toISOString(),
          endDate: now.toISOString()
        };
        console.log(`Filtro criado - Últimos ${filter.value} dias:`, result);
        return result;
      }
      break;
      
    case 'last_hours':
      if (filter.value && filter.value > 0) {
        const startDate = new Date(now);
        startDate.setHours(startDate.getHours() - filter.value);
        const result = {
          startDate: startDate.toISOString(),
          endDate: now.toISOString()
        };
        console.log(`Filtro criado - Últimas ${filter.value} horas:`, result);
        return result;
      }
      break;
      
    case 'custom_period':
      if (filter.start_date && filter.end_date) {
        const result = {
          startDate: new Date(filter.start_date).toISOString(),
          endDate: new Date(filter.end_date).toISOString()
        };
        console.log('Filtro criado - Período customizado:', result);
        return result;
      }
      break;
      
    case 'session_only':
      // Para sessão atual, usar a hora que a aplicação foi iniciada
      // Como não temos essa informação, vamos usar as últimas 8 horas como aproximação
      const sessionStart = new Date(now);
      sessionStart.setHours(sessionStart.getHours() - 8);
      const result = {
        startDate: sessionStart.toISOString(),
        endDate: now.toISOString()
      };
      console.log('Filtro criado - Sessão atual (últimas 8 horas):', result);
      return result;
  }
  
  console.log('Nenhum filtro válido pôde ser criado');
  return null;
}

module.exports = DB;