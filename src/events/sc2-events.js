module.exports = function(sc2Monitor, io, statsTracker, database) {

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
};