const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

// Store connected players and game rooms
const players = new Map();
const gameRooms = new Map();

// Game state
const gameState = {
    waitingPlayers: [],
    activeGames: new Map()
};

// Handle new connections
server.on('connection', (ws) => {
    const playerId = generatePlayerId();
    players.set(playerId, {
        ws,
        status: 'waiting',
        gameId: null
    });

    // Send player their ID
    ws.send(JSON.stringify({
        type: 'connected',
        playerId: playerId
    }));

    // Handle incoming messages
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        handleMessage(playerId, data);
    });

    // Handle disconnections
    ws.on('close', () => {
        handleDisconnect(playerId);
    });
});

// Generate unique player ID
function generatePlayerId() {
    return Math.random().toString(36).substr(2, 9);
}

// Handle incoming messages
function handleMessage(playerId, data) {
    const player = players.get(playerId);
    if (!player) return;

    switch (data.type) {
        case 'findMatch':
            findMatch(playerId);
            break;
        case 'gameUpdate':
            handleGameUpdate(playerId, data);
            break;
        case 'cancelMatchmaking':
            cancelMatchmaking(playerId);
            break;
    }
}

// Find match for player
function findMatch(playerId) {
    const player = players.get(playerId);
    if (!player || player.status !== 'waiting') return;

    // Add player to waiting queue
    gameState.waitingPlayers.push(playerId);
    player.status = 'waiting';

    // Notify player they're in queue
    player.ws.send(JSON.stringify({
        type: 'matchmaking',
        status: 'waiting'
    }));

    // Try to match players
    tryMatchPlayers();
}

// Try to match waiting players
function tryMatchPlayers() {
    if (gameState.waitingPlayers.length >= 2) {
        const player1Id = gameState.waitingPlayers.shift();
        const player2Id = gameState.waitingPlayers.shift();

        const gameId = generateGameId();
        const gameRoom = {
            id: gameId,
            players: [player1Id, player2Id],
            state: {
                ball: {
                    x: 400,
                    y: 200,
                    speedX: 5,
                    speedY: 5
                },
                player1: { y: 150 },
                player2: { y: 150 },
                score: { player1: 0, player2: 0 }
            }
        };

        gameRooms.set(gameId, gameRoom);

        // Update player statuses
        const player1 = players.get(player1Id);
        const player2 = players.get(player2Id);
        player1.status = 'playing';
        player2.status = 'playing';
        player1.gameId = gameId;
        player2.gameId = gameId;

        // Notify players game is starting
        player1.ws.send(JSON.stringify({
            type: 'gameStart',
            gameId: gameId,
            playerNumber: 1
        }));

        player2.ws.send(JSON.stringify({
            type: 'gameStart',
            gameId: gameId,
            playerNumber: 2
        }));
    }
}

// Handle game state updates
function handleGameUpdate(playerId, data) {
    const player = players.get(playerId);
    if (!player || !player.gameId) return;

    const gameRoom = gameRooms.get(player.gameId);
    if (!gameRoom) return;

    // Update game state
    gameRoom.state = data.gameState;

    // Broadcast update to other player
    const otherPlayerId = gameRoom.players.find(id => id !== playerId);
    const otherPlayer = players.get(otherPlayerId);
    if (otherPlayer) {
        otherPlayer.ws.send(JSON.stringify({
            type: 'gameUpdate',
            gameState: gameRoom.state
        }));
    }
}

// Handle player disconnection
function handleDisconnect(playerId) {
    const player = players.get(playerId);
    if (!player) return;

    // Remove from waiting queue if present
    gameState.waitingPlayers = gameState.waitingPlayers.filter(id => id !== playerId);

    // Handle active game
    if (player.gameId) {
        const gameRoom = gameRooms.get(player.gameId);
        if (gameRoom) {
            // Notify other player
            const otherPlayerId = gameRoom.players.find(id => id !== playerId);
            const otherPlayer = players.get(otherPlayerId);
            if (otherPlayer) {
                otherPlayer.ws.send(JSON.stringify({
                    type: 'opponentDisconnected'
                }));
            }
            gameRooms.delete(player.gameId);
        }
    }

    players.delete(playerId);
}

// Cancel matchmaking
function cancelMatchmaking(playerId) {
    gameState.waitingPlayers = gameState.waitingPlayers.filter(id => id !== playerId);
    const player = players.get(playerId);
    if (player) {
        player.status = 'waiting';
        player.ws.send(JSON.stringify({
            type: 'matchmaking',
            status: 'cancelled'
        }));
    }
}

// Generate unique game ID
function generateGameId() {
    return Math.random().toString(36).substr(2, 9);
}

console.log('WebSocket server running on port 8080'); 
