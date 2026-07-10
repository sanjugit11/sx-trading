import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { logger } from "../utils/logger";

let ioServer: Server | null = null;

export function initWebSocketServer(server: HttpServer) {
  ioServer = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  ioServer.on("connection", (socket) => {
    logger.info(`WebSocket Client connected: ${socket.id}`);

    socket.on("subscribe", (room: string) => {
      socket.join(room);
      logger.info(`Client ${socket.id} subscribed to room: ${room}`);
    });

    socket.on("unsubscribe", (room: string) => {
      socket.leave(room);
      logger.info(`Client ${socket.id} unsubscribed from room: ${room}`);
    });

    socket.on("disconnect", () => {
      logger.info(`WebSocket Client disconnected: ${socket.id}`);
    });
  });
}

export function emitToUser(userAddress: string, event: string, data: any) {
  if (ioServer) {
    ioServer.to(`user:${userAddress.toLowerCase()}`).emit(event, data);
    logger.info(`WS emitted [${event}] to user:${userAddress.toLowerCase()}`);
  }
}
