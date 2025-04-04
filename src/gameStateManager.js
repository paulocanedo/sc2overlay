const EventEmitter = require('./eventEmitter');

// Game states
const GameState = {
    IN_MENUS: 'IN_MENUS',
    IN_GAME: 'IN_GAME',
    IN_REPLAY: 'IN_REPLAY'
};

class GameStateManager {
    constructor(config = {}) {
        this.events = new EventEmitter();
        this.currentState = GameState.IN_MENUS;
        this.lastGameEndTime = 0;
        this.stateHistory = [];
        this.lastGameState = null;
        this.gameStarted = false;
        this.minGameEndCooldown = config.minGameEndCooldown || 500; // Cooldown period in ms
        this.debug = config.debug || false;

        // Add initial state to history
        this.addToHistory('Initialization', { state: this.currentState });
    }

    // Process data from /ui and /game endpoints
    processGameData(uiData, gameData) {
        if (!this.validateData(uiData, gameData)) {
            return;
        }

        const timestamp = Date.now();
        const activeScreens = uiData.activeScreens || [];
        const isInGameUI = activeScreens.length === 0;
        const isReplay = gameData.isReplay || false;
        const prevState = this.currentState;

        // Determine the new state
        let newState;
        if (isInGameUI) {
            if (isReplay) {
                newState = GameState.IN_REPLAY;
            } else if (this.isValid1v1Match(gameData)) {
                // Check if it's too soon after the last game ended
                if (prevState === GameState.IN_MENUS &&
                    timestamp - this.lastGameEndTime < this.minGameEndCooldown) {
                    this.log('Ignoring quick transition to IN_GAME due to cooldown period');
                    return;
                }
                newState = GameState.IN_GAME;
            } else {
                newState = GameState.IN_MENUS;
            }
        } else {
            newState = GameState.IN_MENUS;
        }

        // Handle state transitions and events
        if (prevState !== newState) {
            this.handleStateTransition(prevState, newState, gameData, timestamp);
        } else if (this.currentState === GameState.IN_GAME) {
            // Check for game result changes while in the same state
            this.checkGameResultChanges(gameData);
        }

        // Store the game data for next comparison
        this.lastGameState = JSON.parse(JSON.stringify(gameData));
    }

    // Validate input data
    validateData(uiData, gameData) {
        if (!uiData || !Array.isArray(uiData.activeScreens)) {
            this.log('Invalid UI data received', 'error');
            return false;
        }

        if (!gameData || !Array.isArray(gameData.players)) {
            this.log('Invalid game data received', 'error');
            return false;
        }

        return true;
    }

    // Check if it's a valid 1v1 match between humans
    isValid1v1Match(gameData) {
        if (!gameData || !gameData.players) {
            return false;
        }

        // Filter players by type
        const users = gameData.players.filter(player => player.type === 'user');
        const computers = gameData.players.filter(player => player.type === 'computer');

        // Verify we have exactly 2 human players and no AI
        return users.length === 2 && computers.length === 0;
    }

    // Handle state transitions and emit appropriate events
    handleStateTransition(prevState, newState, gameData, timestamp) {
        this.log(`State transition: ${prevState} -> ${newState}`);

        // Add to history
        this.addToHistory('State transition', {
            fromState: prevState,
            toState: newState,
            timestamp: new Date(timestamp).toISOString()
        });

        // Emit state change event
        this.events.emit('stateChanged', {
            fromState: prevState,
            toState: newState,
            timestamp: new Date(timestamp).toISOString()
        });

        // Handle specific state transitions
        switch (prevState) {
            case GameState.IN_GAME:
                if (newState === GameState.IN_MENUS || newState === GameState.IN_REPLAY) {
                    // Game ended by leaving the game or entering replay
                    if (this.gameStarted) {
                        this.handleGameEnd(gameData, timestamp);
                    }
                }
                break;

            case GameState.IN_REPLAY:
                if (newState === GameState.IN_MENUS) {
                    this.events.emit('replayEnded', {
                        timestamp: new Date(timestamp).toISOString()
                    });
                }
                break;
        }

        switch (newState) {
            case GameState.IN_GAME:
                if (prevState === GameState.IN_MENUS) {
                    // Check if all players have undecided result (new game)
                    const allUndecided = gameData.players
                        .filter(player => player.type === 'user')
                        .every(player => !player.result || player.result === 'Undecided');

                    if (allUndecided) {
                        this.handleGameStart(gameData, timestamp);
                    }
                }
                break;

            case GameState.IN_REPLAY:
                if (prevState !== GameState.IN_REPLAY) {
                    this.events.emit('replayStarted', {
                        players: gameData.players.filter(player => player.type === 'user').map(this.formatPlayer),
                        isReplay: true,
                        timestamp: new Date(timestamp).toISOString()
                    });
                }
                break;
        }

        // Update current state
        this.currentState = newState;
    }

    // Handle game start event
    handleGameStart(gameData, timestamp) {
        if (this.gameStarted) {
            this.log('WARNING: gameStarted event triggered again before gameEnded', 'error');
        }

        this.gameStarted = true;
        this.addToHistory('Game started', { players: gameData.players });

        this.events.emit('gameStarted', {
            players: gameData.players.filter(player => player.type === 'user').map(this.formatPlayer),
            isReplay: false,
            timestamp: new Date(timestamp).toISOString()
        });
    }

    // Handle game end event
    handleGameEnd(gameData, timestamp) {
        this.lastGameEndTime = timestamp;

        if (!this.gameStarted) {
            this.log('WARNING: gameEnded event triggered before gameStarted', 'error');
            return;
        }

        this.gameStarted = false;
        this.addToHistory('Game ended', { players: gameData.players });

        this.events.emit('gameEnded', {
            players: gameData.players.filter(player => player.type === 'user').map(this.formatPlayer),
            timestamp: new Date(timestamp).toISOString()
        });
    }

    // Check for game result changes while in the same state
    checkGameResultChanges(gameData) {
        if (!this.lastGameState || !this.gameStarted) {
            return;
        }

        const lastPlayers = this.lastGameState.players || [];
        const currentPlayers = gameData.players || [];

        // Check if any player result changed from Undecided to something else
        const resultsChanged = this.didResultsChange(lastPlayers, currentPlayers);

        if (resultsChanged) {
            this.log('Game results changed while in IN_GAME state');
            this.handleGameEnd(gameData, Date.now());
        }
    }

    // Check if any player's result changed from Undecided to something else
    didResultsChange(lastPlayers, currentPlayers) {
        for (const lastPlayer of lastPlayers) {
            if (lastPlayer.type !== 'user') continue;

            // Find corresponding player in current data
            const currentPlayer = currentPlayers.find(
                p => p.type === 'user' && p.name === lastPlayer.name
            );

            if (!currentPlayer) continue;

            // Check if result changed from Undecided to something else
            if ((lastPlayer.result === 'Undecided' || !lastPlayer.result) &&
                currentPlayer.result && currentPlayer.result !== 'Undecided') {
                return true;
            }
        }

        return false;
    }

    // Format player data for events
    formatPlayer(player) {
        return {
            id: player.id,
            name: player.name,
            race: player.race,
            result: player.result || 'Undecided'
        };
    }

    // Add entry to history
    addToHistory(action, data) {
        this.stateHistory.push({
            timestamp: new Date().toISOString(),
            action,
            data
        });

        // Limit history size to avoid memory issues
        if (this.stateHistory.length > 100) {
            this.stateHistory.shift();
        }
    }

    // Get state history for debugging
    getStateHistory() {
        return this.stateHistory;
    }

    // Register event listener
    on(event, callback) {
        return this.events.on(event, callback);
    }

    // Logger
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[GameStateManager] [${level.toUpperCase()}] [${timestamp}]`;

        if (level === 'error') {
            console.error(`${prefix} ${message}`);
        } else if (level === 'warn') {
            console.warn(`${prefix} ${message}`);
        } else if (this.debug || level !== 'debug') {
            console.log(`${prefix} ${message}`);
        }
    }
}

module.exports = { GameStateManager, GameState };