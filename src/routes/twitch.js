const express = require('express');
const crypto = require('crypto');
const { checkTwitchConfig, asyncHandler } = require('../middleware/twitch-middleware');

module.exports = function(config, twitchAuth, twitchApi, authStates) {
    const router = express.Router();

    // Middleware para verificar configuração da Twitch
    router.use(checkTwitchConfig(config));

    // Rota para obter configuração da Twitch
    router.get('/config', (req, res) => {
        // Enviar apenas configurações públicas (sem secrets)
        const twitchConfig = {
            enabled: config.twitch?.enabled || false,
            channelName: config.twitch?.channel_name || '',
            updateInterval: config.twitch?.update_interval || 60000
        };

        res.json(twitchConfig);
    });

    // Rota para obter URL de autorização da Twitch
    router.get('/auth-url', (req, res) => {
        // Gerar estado único para esta sessão
        const state = crypto.randomBytes(16).toString('hex');
        const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutos de validade

        // Armazenar estado para validação posterior
        authStates.set(state, { expiresAt });

        // Gerar URL de autorização
        const authUrl = twitchAuth.generateAuthUrl(state);

        res.json({ url: authUrl, state });
    });

    // Rota para verificar status da autenticação Twitch
    router.get('/auth-status', asyncHandler(async (req, res) => {
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
    }));

    // Rota para revogar autorização Twitch
    router.post('/revoke', asyncHandler(async (req, res) => {
        const success = await twitchAuth.revokeAccess();
        res.json({ success });
    }));

    // Rota para obter estatísticas da Twitch
    router.get('/stats', asyncHandler(async (req, res) => {
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
    }));

    return router;
};