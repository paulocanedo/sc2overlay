const express = require('express');
const { checkTwitchConfig, validateAuthState, asyncHandler } = require('../middleware/twitch-middleware');
const { createErrorHtml, createSuccessHtml } = require('../utils/html-utils');

module.exports = function(config, twitchAuth, twitchApi, authStates) {
    const router = express.Router();

    // Middleware para verificar configuração da Twitch
    router.use(checkTwitchConfig(config));

    // Rota de callback para autorização OAuth da Twitch
    router.get('/callback', asyncHandler(async (req, res) => {
        const { code, state, error, error_description } = req.query;

        // Verificar erro
        if (error) {
            console.error(`Erro na autenticação Twitch: ${error} - ${error_description}`);
            return res.send(createErrorHtml(
                'Falha na Autenticação Twitch',
                `${error}: ${error_description}`
            ));
        }

        // Verificar estado
        const stateError = validateAuthState(req, res, state, authStates);
        if (stateError) return stateError;

        // Remover estado usado
        authStates.delete(state);

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
            return res.send(createSuccessHtml(
                'Autorização Twitch Concluída',
                'Seu overlay agora está conectado à sua conta da Twitch!',
                'Voltar ao Início',
                true
            ));
        } else {
            return res.status(500).send(createErrorHtml(
                'Falha na Autenticação Twitch',
                'Não foi possível obter os tokens de acesso. Por favor, tente novamente mais tarde.'
            ));
        }
    }));

    return router;
};