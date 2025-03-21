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
          is_replay INTEGER DEFAULT 0,
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
        isReplay = false,
        mapName = null,
        gameLength = null,
        rawData = null
      } = matchData;
      
      const stmt = this.db.prepare(`
        INSERT INTO matches (
          timestamp, player_name, opponent_name, player_race, opponent_race, 
          result, is_replay, map_name, game_length, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const insertResult = stmt.run(
        timestamp,
        playerName,
        opponentName,
        playerRace,
        opponentRace,
        result,
        isReplay ? 1 : 0,
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
  
  async getMatchStats() {
    if (!this.connected || !this.db) {
      console.error('Banco de dados não está conectado');
      return null;
    }
    
    try {
      // Estatísticas gerais
      const totalStatsStmt = this.db.prepare(`
        SELECT 
          COUNT(*) AS total_games,
          SUM(CASE WHEN result = 'Victory' THEN 1 ELSE 0 END) AS total_wins,
          SUM(CASE WHEN result = 'Defeat' THEN 1 ELSE 0 END) AS total_losses
        FROM matches
        WHERE is_replay = 0
      `);
      
      const totalStats = totalStatsStmt.get();
      
      // Estatísticas por raça
      const raceStatsStmt = this.db.prepare(`
        SELECT 
          opponent_race,
          COUNT(*) AS games,
          SUM(CASE WHEN result = 'Victory' THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN result = 'Defeat' THEN 1 ELSE 0 END) AS losses
        FROM matches
        WHERE is_replay = 0
        GROUP BY opponent_race
      `);
      
      const raceStats = raceStatsStmt.all();
      
      // Último jogo
      const lastMatchStmt = this.db.prepare(`
        SELECT * FROM matches
        WHERE is_replay = 0
        ORDER BY timestamp DESC
        LIMIT 1
      `);
      
      const lastMatch = lastMatchStmt.get();
      
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
      }
      
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
        WHERE is_replay = 0
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

module.exports = DB;