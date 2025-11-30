import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

let waitingUser = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('find_partner', (peerId) => {
        // We receive the PeerJS ID from the client
        if (waitingUser) {
            // Match found
            const partnerSocketId = waitingUser.socketId;
            const partnerPeerId = waitingUser.peerId;

            // Tell Initiator (Current Socket) to call Waiting User
            io.to(socket.id).emit('match_found', {
                role: 'initiator',
                partnerPeerId: partnerPeerId
            });

            // Tell Waiting User to expect a call
            io.to(partnerSocketId).emit('match_found', {
                role: 'receiver',
                partnerPeerId: peerId
            });

            console.log(`Matched ${peerId} (Init) with ${partnerPeerId} (Wait)`);
            waitingUser = null;
        } else {
            // Wait
            waitingUser = { socketId: socket.id, peerId: peerId };
            console.log(`User ${peerId} is waiting`);
        }
    });

    socket.on('disconnect', () => {
        if (waitingUser && waitingUser.socketId === socket.id) {
            waitingUser = null;
        }
    });
});

const PORT = 3003;
httpServer.listen(PORT, () => {
    console.log(`V3 Server (PeerJS) running on port ${PORT}`);
});
