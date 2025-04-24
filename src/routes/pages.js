const express = require('express');
const path = require('path');

module.exports = function(publicPath) {
    const router = express.Router();

    // Página inicial
    router.get('/', (req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });

    // Rota para o painel de estatísticas
    router.get('/stats-dashboard', (req, res) => {
        res.sendFile(path.join(publicPath, 'stats-dashboard.html'));
    });

    // Rota para a barra de partida
    router.get('/match-bar', (req, res) => {
        res.sendFile(path.join(publicPath, 'match-bar.html'));
    });

    // Rota para o painel de debug de estado do jogo
    router.get('/debug/game-state', (req, res) => {
        res.sendFile(path.join(publicPath, 'game-state-debug.html'));
    });

    return router;
};