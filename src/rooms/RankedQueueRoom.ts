import { Room, Client, Delayed, matchMaker, spliceOne, ClientArray, ClientState } from "@colyseus/core";

interface RankedQueueOptions {
  maxWaitingTime?: number;
  maxPlayers?: number;
  roomNameToCreate?: string;
  maxWaitingTimeForPriority?: number;
}

interface MatchGroup {
  averageRank: number;
  clients: Array<Client<ClientQueueData>>,
  priority?: boolean;

  ready?: boolean;
  confirmed?: number;

  // cancelConfirmationTimeout?: Delayed;
}

interface ClientQueueData {
  /**
   * Timestamp of when the client entered the queue
   */
  entryTime: number;

  /**
   * Rank of the client
   */
  rank: number;

  /**
   * Additional options passed by the client when joining the room
   */
  options?: any;

  /**
   * Match group the client is currently in
   */
  group?: MatchGroup;

  /**
   * Whether the client has confirmed the connection to the room
   */
  confirmed?: boolean;

  /**
   * The last number of clients in the queue sent to the client
   */
  lastQueueClientCount?: number;
}

export class RankedQueueRoom extends Room {
  /**
   * If `allowUnmatchedGroups` is true, players inside an unmatched group (that
   * did not reached `maxPlayers`, and `maxWaitingTime` has been
   * reached) will be matched together. Your room should fill the remaining
   * spots with "bots" on this case.
   */
  allowUnmatchedGroups: boolean = false

  /**
   * Evaluate groups for each client at interval
   */
  evaluateGroupsInterval = 2000;

  /**
   * Groups of players per iteration
   */
  groups: MatchGroup[] = [];

  /**
   * name of the room to create
   */
  roomNameToCreate = "my_room";

  /**
   * after this time, create a match with a bot
   */
  maxWaitingTime = 15 * 1000;

  /**
   * after this time, try to fit this client with a not-so-compatible group
   */
  maxWaitingTimeForPriority?: number = 10 * 1000;

  /**
   * number of players on each match
   */
  maxPlayers = 4;

  // /**
  //  * after a group is ready, clients have this amount of milliseconds to confirm
  //  * connection to the created room
  //  */
  // cancelConfirmationAfter = 5000;

  onCreate(options: RankedQueueOptions) {
    if (options.maxWaitingTime) {
      this.maxWaitingTime = options.maxWaitingTime;
    }

    if (options.maxPlayers) {
      this.maxPlayers = options.maxPlayers;
    }

    this.onMessage("confirm", (client: Client<ClientQueueData>, message: any) => {
      const stat = client.userData;

      if (stat && stat.group && typeof (stat.group.confirmed) === "number") {
        stat.confirmed = true;
        stat.group.confirmed++;
        client.leave();
      }
    })

    /**
     * Redistribute clients into groups at every interval
     */
    this.setSimulationInterval(() => this.redistributeGroups(), this.evaluateGroupsInterval);
  }

  onJoin(client: Client, options: any) {
    console.log("ON JOIN:", options);
    this.addToQueue(client, {
      rank: options.rank,
      entryTime: Date.now(),
      options,
    });
  }

  addToQueue(client: Client, queueData: ClientQueueData) {
    client.userData = queueData;
    client.send("clients", 1);
  }

  createMatchGroup() {
    const group: MatchGroup = { clients: [], averageRank: 0 };
    this.groups.push(group);
    return group;
  }

  redistributeGroups() {
    // re-set all groups
    this.groups.length = 0;

    const sortedClients = (this.clients as ClientArray<ClientQueueData>)
      .filter((client) => {
        // Filter out:
        // - clients that are not in the queue
        // - clients that are already in a "ready" group
        return (
          client.userData &&
          client.userData.group?.ready !== true
        );
      })
      .sort((a, b) => a.userData.rank - b.userData.rank); // sort by rank

    let currentGroup: MatchGroup = this.createMatchGroup();
    let totalRank = 0;

    for (let i = 0, l = sortedClients.length; i < l; i++) {
      const client = sortedClients[i];
      const queueData = client.userData;

      const waitingTime = Date.now() - client.userData.entryTime;

      /**
       * Force this client to join a group, even if rank is incompatible
       */
      if (
        this.maxWaitingTimeForPriority !== undefined &&
        waitingTime >= this.maxWaitingTimeForPriority
      ) {
        currentGroup.priority = true;
      }

      if (
        currentGroup.averageRank > 0 &&
        !currentGroup.priority
      ) {
        const diff = Math.abs(queueData.rank - currentGroup.averageRank);
        const diffRatio = (diff / currentGroup.averageRank);

        /**
         * TODO: MAGIC NUMBERS ARE NOT WELCOME HERE!
         * figure out how to identify the diff ratio that makes sense
         */
        if (diffRatio > 2) {
          currentGroup = this.createMatchGroup();
          totalRank = 0;
        }
      }

      queueData.group = currentGroup;
      currentGroup.clients.push(client);

      totalRank += queueData.rank;
      currentGroup.averageRank = totalRank / currentGroup.clients.length;

      if (
        (currentGroup.clients.length === this.maxPlayers) ||

        /**
         * Match long-waiting clients with bots
         * FIXME: peers of this group may be entered short ago
         */
        (waitingTime >= this.maxWaitingTime && this.allowUnmatchedGroups)
      ) {
        currentGroup.ready = true;
        currentGroup = this.createMatchGroup();
        totalRank = 0;
      }
    }

    this.processReadyGroups();
  }

  processReadyGroups() {
    this.groups.forEach(async (group) => {
      if (group.ready) {
        group.confirmed = 0;

        /**
         * Create room instance in the server.
         */
        // TODO: handle if an error occurs when creating the room
        // TODO: handle if an error occurs when reserving a seat for the client
        // TODO: handle if some client couldn't "confirm" connection
        const room = await matchMaker.createRoom(this.roomNameToCreate, {});

        await Promise.all(group.clients.map(async (client) => {
          const matchData = await matchMaker.reserveSeatFor(room, client.userData.options, client.auth);

          /**
           * Send room data for new WebSocket connection!
           */
          client.send("seat", matchData);
        }));

        // /**
        //  * Cancel & re-enqueue clients if some of them couldn't confirm connection.
        //  */
        // group.cancelConfirmationTimeout = this.clock.setTimeout(() => {
        //   group.clients.forEach(stat => {
        //     this.send(stat.client, 0);
        //     stat.group = undefined;
        //     stat.waitingTime = 0;
        //   });
        // }, this.cancelConfirmationAfter);

      } else {
        /**
         * Notify clients within the group on how many players are in the queue
         */
        group.clients.forEach((client) => {
          //
          // avoid sending the same number of clients to the client if it hasn't changed
          //
          const queueClientCount = group.clients.length;
          if (client.userData.lastQueueClientCount !== queueClientCount) {
            client.userData.lastQueueClientCount = queueClientCount;
            client.send("clients", queueClientCount);
          }
        });
      }
    })
  }

  onLeave(client: Client, consented: boolean) { }
  onDispose() {}

}
