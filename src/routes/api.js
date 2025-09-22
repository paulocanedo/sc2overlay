const express = require('express');
const { asyncHandler } = require('../middleware/twitch-middleware');

module.exports = function(config, statsTracker, sc2Monitor, database) {
    const router = express.Router();

    // Rota para obter estatísticas com filtro de tempo opcional
    router.get('/stats', async (req, res) => {
        try {
            // Extrair parâmetros de filtro de tempo da query string
            const { startDate, endDate } = req.query;
            
            console.log('Query params recebidos:', { startDate, endDate });
            
            let timeFilter = null;
            if (startDate || endDate) {
                timeFilter = {};
                if (startDate) timeFilter.startDate = startDate;
                if (endDate) timeFilter.endDate = endDate;
                
                console.log('Aplicando filtro de tempo nas estatísticas:', timeFilter);
            } else {
                console.log('Nenhum parâmetro de filtro recebido na API');
            }

            let stats;
            
            if (database && database.connected) {
                // Usar banco de dados com filtro
                stats = await database.getMatchStats(timeFilter);
                
                if (!stats) {
                    console.warn('Nenhuma estatística encontrada no banco de dados');
                    // Fallback para statsTracker se o banco não retornar dados
                    stats = statsTracker.getStats();
                }
            } else {
                console.warn('Banco de dados não está disponível, usando statsTracker');
                stats = statsTracker.getStats();
            }
            
            res.json(stats || {
                total: { games: 0, wins: 0, losses: 0 },
                byRace: {
                    Terr: { games: 0, wins: 0, losses: 0 },
                    Prot: { games: 0, wins: 0, losses: 0 },
                    Zerg: { games: 0, wins: 0, losses: 0 },
                    random: { games: 0, wins: 0, losses: 0 }
                },
                lastGame: null
            });
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    });

    // Rota para obter partidas recentes com filtro de tempo opcional
    router.get('/matches/recent', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const { startDate, endDate } = req.query;
            
            console.log('Query params recebidos em /matches/recent:', { startDate, endDate, limit });
            
            let matches = [];
            
            if (database && database.connected) {
                // Se há filtro de tempo, usar consulta SQL customizada
                if (startDate || endDate) {
                    console.log('Aplicando filtro de tempo nas partidas recentes:', { startDate, endDate });
                    
                    let query = `SELECT * FROM matches`;
                    let params = [];
                    let whereConditions = [];
                    
                    if (startDate) {
                        whereConditions.push('timestamp >= ?');
                        params.push(startDate);
                    }
                    
                    if (endDate) {
                        whereConditions.push('timestamp <= ?');
                        params.push(endDate);
                    }
                    
                    if (whereConditions.length > 0) {
                        query += ' WHERE ' + whereConditions.join(' AND ');
                    }
                    
                    query += ' ORDER BY timestamp DESC LIMIT ?';
                    params.push(limit);
                    
                    console.log('Query SQL gerada:', query);
                    console.log('Parâmetros:', params);
                    
                    try {
                        const stmt = database.db.prepare(query);
                        matches = stmt.all(...params);
                        console.log(`Partidas encontradas com filtro: ${matches.length}`);
                    } catch (dbError) {
                        console.error('Erro na consulta SQL filtrada:', dbError);
                        matches = [];
                    }
                } else {
                    // Sem filtro, usar método existente
                    console.log('Sem filtro, usando método padrão');
                    matches = await database.getRecentMatches(limit);
                }
            } else {
                console.warn('Banco de dados não está disponível para partidas recentes');
            }
            
            res.json(matches || []);
        } catch (error) {
            console.error('Erro ao obter partidas recentes:', error);
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    });

    // Rota para obter o estado atual do jogo
    router.get('/game', (req, res) => {
        if (sc2Monitor.currentGame) {
            res.json(sc2Monitor.currentGame);
        } else {
            res.json({ players: [] });
        }
    });

    // Rota para obter status do servidor
    router.get('/status', (req, res) => {
        res.json({
            connected: sc2Monitor.isConnected || false,
            inGame: sc2Monitor.isInGame || false,
            port: config.server.port,
            uptime: process.uptime()
        });
    });

    // Rota para obter histórico de estados para debug
    router.get('/debug/state-history', (req, res) => {
        if (sc2Monitor && sc2Monitor.getStateHistory) {
            const history = sc2Monitor.getStateHistory();
            res.json(history);
        } else {
            res.status(404).json({ error: 'Game state history not available' });
        }
    });

    return router;
};