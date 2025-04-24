const express = require('express');
const { asyncHandler } = require('../middleware/twitch-middleware');

module.exports = function(config, statsTracker, sc2Monitor, database) {
    const router = express.Router();

    // Rota para obter configuração
    router.get('/config', (req, res) => {
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
    router.get('/stats', (req, res) => {
        res.json(statsTracker.getStats());
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

    // Rota para obter partidas recentes
    router.get('/matches/recent', asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit) || 10;
        const matches = await database.getRecentMatches(limit);
        res.json(matches);
    }));

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