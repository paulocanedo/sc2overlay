module.exports = function(sc2Monitor, io, statsTracker, database) {

    // Função para obter estatísticas com filtro de tempo baseado na configuração
    async function getStatsWithTimeFilter() {
        if (database && database.connected) {
            // Carregar a configuração atual
            const { loadConfig } = require('../utils/config-utils');
            const config = loadConfig();
            
            // Criar filtro de tempo baseado na configuração
            const timeFilter = createTimeFilterFromConfig(config);
            
            // Obter estatísticas do banco com filtro
            const stats = await database.getMatchStats(timeFilter);
            
            if (stats) {
                console.log('Enviando estatísticas com filtro de tempo aplicado');
                return stats;
            }
        }
        
        // Fallback para statsTracker se banco não estiver disponível
        console.log('Enviando estatísticas do statsTracker (sem filtro)');
        return statsTracker.getStats();
    }

    // Função auxiliar para criar filtro de tempo (copiada de db.js)
    function createTimeFilterFromConfig(config) {
        if (!config || 
            !config.stats || 
            !config.stats.time_filter || 
            !config.stats.time_filter.enabled) {
            return null;
        }
        
        const filter = config.stats.time_filter;
        const now = new Date();
        
        switch (filter.type) {
            case 'last_days':
                if (filter.value && filter.value > 0) {
                    const startDate = new Date(now);
                    startDate.setDate(startDate.getDate() - filter.value);
                    return {
                        startDate: startDate.toISOString(),
                        endDate: now.toISOString()
                    };
                }
                break;
                
            case 'last_hours':
                if (filter.value && filter.value > 0) {
                    const startDate = new Date(now);
                    startDate.setHours(startDate.getHours() - filter.value);
                    return {
                        startDate: startDate.toISOString(),
                        endDate: now.toISOString()
                    };
                }
                break;
                
            case 'custom_period':
                if (filter.start_date && filter.end_date) {
                    return {
                        startDate: new Date(filter.start_date).toISOString(),
                        endDate: new Date(filter.end_date).toISOString()
                    };
                }
                break;
                
            case 'session_only':
                const sessionStart = new Date(now);
                sessionStart.setHours(sessionStart.getHours() - 8);
                return {
                    startDate: sessionStart.toISOString(),
                    endDate: now.toISOString()
                };
        }
        
        return null;
    }

    // Manipular eventos do SC2
    sc2Monitor.on('gameStarted', (data) => {
        console.log('Partida iniciada:', data);
        io.emit('gameStarted', data);
    });

    sc2Monitor.on('gameEnded', async (data) => {
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

        // Enviar estatísticas atualizadas COM FILTRO DE TEMPO
        io.emit('gameEnded', data);
        
        try {
            const filteredStats = await getStatsWithTimeFilter();
            io.emit('statsUpdated', filteredStats);
        } catch (error) {
            console.error('Erro ao obter estatísticas com filtro:', error);
            // Fallback para estatísticas sem filtro
            io.emit('statsUpdated', statsTracker.getStats());
        }
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
};