import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";

import { RankedLobbyRoom } from "./RankedLobbyRoom";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT || 2567);
const app = express()

app.use(cors());
app.use(express.json())

const server = http.createServer(app);
const gameServer = new Server({
  server,
});

export const matchMaker = gameServer.matchMaker;

// register your room handlers
gameServer
  .define('ranked', RankedLobbyRoom)
  .filterBy(['numClientsToMatch']);

gameServer.define('game', GameRoom);

app.use(express.static(__dirname));

// register colyseus monitor AFTER registering your room handlers
app.use("/colyseus", monitor(gameServer));

gameServer.listen(port);
console.log(`Listening on ws://localhost:${ port }`)
