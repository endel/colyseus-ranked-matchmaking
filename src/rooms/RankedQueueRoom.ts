import { Room, Client, matchMaker, ClientArray, } from "@colyseus/core";

interface RankedQueueOptions {
  maxPlayers?: number;
  roomNameToCreate?: string;

  maxWaitingCycles?: number;
  maxWaitingCyclesForPriority?: number;

  allowIncompleteGroups?: boolean;
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
  currentCycle: number;

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
   * Evaluate groups for each client at interval
   */
  cycleTickInterval = 2000;

  /**
   * after these cycles, create a match with a bot
   */
  maxWaitingCycles = 15;

  /**
   * after this time, try to fit this client with a not-so-compatible group
   */
  maxWaitingCyclesForPriority?: number = 10 * 1000;

  /**
   * number of players on each match
   */
  maxPlayers = 4;

  /**
   * If `allowIncompleteGroups` is true, players inside an unmatched group (that
   * did not reached `maxPlayers`, and `maxWaitingCycles` has been
   * reached) will be matched together. Your room should fill the remaining
   * spots with "bots" on this case.
   */
  allowIncompleteGroups: boolean = false;

  /**
   * Groups of players per iteration
   */
  groups: MatchGroup[] = [];

  /**
   * name of the room to create
   */
  roomNameToCreate = "my_room";

  // /**
  //  * after a group is ready, clients have this amount of milliseconds to confirm
  //  * connection to the created room
  //  */
  // cancelConfirmationAfter = 5000;

  onCreate(options: RankedQueueOptions) {
    if (options.maxWaitingCycles) {
      this.maxWaitingCycles = options.maxWaitingCycles;
    }

    if (options.maxPlayers) {
      this.maxPlayers = options.maxPlayers;
    }

    this.onMessage("confirm", (client: Client<ClientQueueData>, message: any) => {
      const queueData = client.userData;

      if (queueData && queueData.group && typeof (queueData.group.confirmed) === "number") {
        queueData.confirmed = true;
        queueData.group.confirmed++;
        // TODO:
        // queueData.group.confirmed === clients.length
        client.leave();
      }
    });

    /**
     * Redistribute clients into groups at every interval
     */
    this.setSimulationInterval(() => this.redistributeGroups(), this.cycleTickInterval);
  }

  onJoin(client: Client, options: any) {
    console.log("ON JOIN:", options);
    this.addToQueue(client, {
      rank: options.rank,
      currentCycle: 0,
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
      const userData = client.userData;
      const currentCycle = userData.currentCycle;

      /**
       * Force this client to join a group, even if rank is incompatible
       */
      if (
        this.maxWaitingCyclesForPriority !== undefined &&
        currentCycle >= this.maxWaitingCyclesForPriority
      ) {
        //
        // TODO: put CLIENT on priority instead of forcing its group to be priority
        //
        currentGroup.priority = true;
      }

      if (
        currentGroup.averageRank > 0 &&
        !currentGroup.priority
      ) {
        const diff = Math.abs(userData.rank - currentGroup.averageRank);
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

      userData.group = currentGroup;
      currentGroup.clients.push(client);

      totalRank += userData.rank;
      currentGroup.averageRank = totalRank / currentGroup.clients.length;

      if (
        (currentGroup.clients.length === this.maxPlayers) ||

        /**
         * Match long-waiting clients with bots
         * FIXME: peers of this group may be entered short ago
         */
        (currentCycle >= this.maxWaitingCycles && this.allowIncompleteGroups)
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

        try {
          /**
           * Create room instance in the server.
           */
          const room = await matchMaker.createRoom(this.roomNameToCreate, {});

          /**
           * Reserve a seat for each client in the group.
           * (If one fails, force all clients to leave, re-queueing is up to the client-side logic)
           */
          const seatReservations = await Promise.all(group.clients.map(async (client) => {
            return await matchMaker.reserveSeatFor(room, client.userData.options, client.auth);
          }));

          /**
           * Send room data for new WebSocket connection!
           */
          group.clients.forEach((client, i) => {
            client.send("seat", seatReservations[i]);
          });

        } catch (e: any) {
          //
          // If creating a room, or reserving a seat failed - fail all clients
          // Whether the clients retry or not is up to the client-side logic
          //
          group.clients.forEach(client => client.leave(1011, e.message));
        }

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

}
