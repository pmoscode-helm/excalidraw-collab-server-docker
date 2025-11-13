import {Server as SocketIO} from "socket.io";
import logger from "./logger";

type UserToFollow = {
    socketId: string;
    username: string;
};
type OnUserFollowedPayload = {
    userToFollow: UserToFollow;
    action: "FOLLOW" | "UNFOLLOW";
};

const port = process.env.PORT || 3002; // default port to listen
const roomPrefix = "follow@"

function withErrorHandling<T extends (...args: any[]) => any>(handler: T) {
    return async (...args: Parameters<T>) => {
        try {
            await handler(...args);
        } catch (error) {
            logger.error(`Server-error: ${error instanceof Error ? error.stack : error}`);
        }
    };
}

logger.info(`Trying to use port ${port}`);

try {
    const io = new SocketIO({
        transports: ["websocket", "polling"],
        cors: {
            allowedHeaders: ["Content-Type", "Authorization"],
            origin: process.env.CORS_ORIGIN || "*",
            credentials: true,
        },
        allowEIO3: true,
    });

    io.on("connection", (socket) => {
        logger.info("connection established!");

        io.to(`${socket.id}`).emit("init-room");

        socket.on("join-room", withErrorHandling(async (roomID) => {
            logger.info(`${socket.id} has joined ${roomID}`);

            await socket.join(roomID);

            const sockets = await io.in(roomID).fetchSockets();
            if (sockets.length <= 1) {
                io.to(`${socket.id}`).emit("first-in-room");
            } else {
                logger.info(`${socket.id} new-user emitted to room ${roomID}`);
                socket.broadcast.to(roomID).emit("new-user", socket.id);
            }

            io.in(roomID).emit(
                "room-user-change",
                sockets.map((socket) => socket.id),
            );
        }));

        socket.on(
            "server-broadcast", withErrorHandling(
                (roomID: string, encryptedData: ArrayBuffer, iv: Uint8Array) => {
                    logger.info(`${socket.id} sends update to ${roomID}`);
                    socket.broadcast.to(roomID).emit("client-broadcast", encryptedData, iv);
                },
            ));

        socket.on(
            "server-volatile-broadcast", withErrorHandling(
                (roomID: string, encryptedData: ArrayBuffer, iv: Uint8Array) => {
                    logger.info(`${socket.id} sends volatile update to ${roomID}`);
                    socket.volatile.broadcast
                        .to(roomID)
                        .emit("client-broadcast", encryptedData, iv);
                },
            ));

        socket.on("user-follow", withErrorHandling(async (payload: OnUserFollowedPayload) => {
            const roomID = `${roomPrefix}${payload.userToFollow.socketId}`;

            switch (payload.action) {
                case "FOLLOW": {
                    await socket.join(roomID);

                    const sockets = await io.in(roomID).fetchSockets();
                    const followedBy = sockets.map((socket) => socket.id);

                    io.to(payload.userToFollow.socketId).emit(
                        "user-follow-room-change",
                        followedBy,
                    );

                    break;
                }
                case "UNFOLLOW": {
                    await socket.leave(roomID);

                    const sockets = await io.in(roomID).fetchSockets();
                    const followedBy = sockets.map((socket) => socket.id);

                    io.to(payload.userToFollow.socketId).emit(
                        "user-follow-room-change",
                        followedBy,
                    );

                    break;
                }
            }
        }));

        socket.on("disconnecting", withErrorHandling(async () => {
            logger.info(`${socket.id} is preparing to disconnect...`);
            for (const roomID of Array.from(socket.rooms)) {
                const otherClients = (await io.in(roomID).fetchSockets()).filter(
                    (_socket) => _socket.id !== socket.id,
                );

                const isFollowRoom = roomID.startsWith(roomPrefix);

                if (!isFollowRoom && otherClients.length > 0) {
                    socket.broadcast.to(roomID).emit(
                        "room-user-change",
                        otherClients.map((socket) => socket.id),
                    );
                }

                if (isFollowRoom && otherClients.length === 0) {
                    const socketId = roomID.replace(roomPrefix, "");
                    io.to(socketId).emit("broadcast-unfollow");
                }
            }
        }));

        socket.on("disconnect", withErrorHandling(() => {
            //socket.removeAllListeners();
            //socket.disconnect();
            logger.info(`... ${socket.id} disconnected`);
        }));
    });

    logger.info("Starting server...");
    io.listen(Number(port));
    logger.info("... started!");
} catch (error) {
    logger.error(`Server-error: ${error instanceof Error ? error.stack : error}`);
}
