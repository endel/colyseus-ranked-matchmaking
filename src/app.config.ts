import config from "@colyseus/tools";
import path from "path";
import express from "express";
import { monitor } from "@colyseus/monitor";
import { playground } from "@colyseus/playground";

/**
 * Import your Room files
 */
import { RankedQueueRoom } from "./rooms/RankedQueueRoom";
import { MyRoom } from "./rooms/MyRoom";

export default config({

  initializeGameServer: (gameServer) => {
    /**
     * Define your room handlers:
     */

    gameServer
      .define('queue', RankedQueueRoom, {
        roomNameToCreate: 'my_room',
        allowIncompleteGroups: true,
      })
      .filterBy(['maxPlayers', 'maxTeamSize']);

    gameServer.define('my_room', MyRoom);
  },

  initializeExpress: (app) => {
    app.use(express.static(path.resolve(__dirname, "..")));

    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    app.get("/hello_world", (req, res) => {
      res.send("It's time to kick ass and chew bubblegum!");
    });

    /**
     * Use @colyseus/playground
     * (It is not recommended to expose this route in a production environment)
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/", playground());
    }

    /**
     * Use @colyseus/monitor
     * It is recommended to protect this route with a password
     * Read more: https://docs.colyseus.io/tools/monitor/#restrict-access-to-the-panel-using-a-password
     */
    app.use("/monitor", monitor());
  },


  beforeListen: () => {
    /**
     * Before before gameServer.listen() is called.
     */
  }
});