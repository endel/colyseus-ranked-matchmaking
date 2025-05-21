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
  ready?: boolean;
  confirmed?: number;
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
   * Whether the client should be prioritized in the queue
   * (e.g. for players that are waiting for a long time)
   */
  highPriority?: boolean;

  /**
   * The last number of clients in the queue sent to the client
   */
  lastQueueClientCount?: number;
}

export class RankedQueueRoom extends Room {
  /**
   * Evaluate groups for each client at interval
   */
  cycleTickInterval = 1000;

  /**
   * after these cycles, create a match with a bot
   */
  maxWaitingCycles = 15;

  /**
   * after this time, try to fit this client with a not-so-compatible group
   */
  maxWaitingCyclesForPriority?: number = 10;

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
  highPriorityGroups: MatchGroup[] = [];

  /**
   * name of the room to create
   */
  roomNameToCreate = "my_room";

  onCreate(options: RankedQueueOptions) {
    if (typeof(options.maxWaitingCycles) === "number") {
      this.maxWaitingCycles = options.maxWaitingCycles;
    }

    if (typeof(options.maxPlayers) === "number") {
      this.maxPlayers = options.maxPlayers;
    }

    if (typeof(options.allowIncompleteGroups) !== "undefined") {
      this.allowIncompleteGroups = options.allowIncompleteGroups;
    }

    this.onMessage("confirm", (client: Client<ClientQueueData>, message: any) => {
      const queueData = client.userData;

      if (queueData && queueData.group && typeof (queueData.group.confirmed) === "number") {
        queueData.confirmed = true;
        queueData.group.confirmed++;
        client.leave();
      }
    });

    /**
     * Redistribute clients into groups at every interval
     */
    this.setSimulationInterval(() => this.reassignMatchGroups(), this.cycleTickInterval);
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

  reassignMatchGroups() {
    // re-set all groups
    this.groups.length = 0;
    this.highPriorityGroups.length = 0;

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
      .sort((a, b) => {
        //
        // Sort by rank ascending
        //
        return a.userData.rank - b.userData.rank;
      });

    let currentGroup: MatchGroup = this.createMatchGroup();
    let totalRank = 0;

    // console.log("\n\n============== REDISTRIBUTE CLIENTS =>", sortedClients.length);

    for (let i = 0, l = sortedClients.length; i < l; i++) {
      const client = sortedClients[i];
      const userData = client.userData;
      const currentCycle = userData.currentCycle++;

      // console.log({ rank: userData.rank, priority: userData.highPriority, avgRank: userData.group?.averageRank, cycle: currentCycle });

      if (currentGroup.averageRank > 0) {
        //
        // TODO: allow end-user to customize this logic without the need to
        // re-implement the whole RankedQueueRoom
        //
        const diff = Math.abs(userData.rank - currentGroup.averageRank);
        const diffRatio = (diff / currentGroup.averageRank);

        // If diff ratio is too high, create a new match group
        if (diffRatio > 2 && !userData.highPriority) {
          currentGroup = this.createMatchGroup();
          totalRank = 0;
        }
      }

      userData.group = currentGroup;
      currentGroup.clients.push(client);

      totalRank += userData.rank;
      currentGroup.averageRank = totalRank / currentGroup.clients.length;

      // Group is ready!
      if (currentGroup.clients.length === this.maxPlayers) {
        currentGroup.ready = true;
        currentGroup = this.createMatchGroup();
        totalRank = 0;
        continue;
      }

      if (currentCycle >= this.maxWaitingCycles && this.allowIncompleteGroups) {
        /**
         * Match long-waiting clients with bots
         */
        if (this.highPriorityGroups.indexOf(currentGroup) === -1) {
          this.highPriorityGroups.push(currentGroup);
        }

      } else if (
        this.maxWaitingCyclesForPriority !== undefined &&
        currentCycle >= this.maxWaitingCyclesForPriority
      ) {
        /**
         * Force this client to join a group, even if rank is incompatible
         */
        userData.highPriority = true;
      }
    }

    /**
     * Evaluate groups with high priority clients
     */
    this.highPriorityGroups.forEach((group) => {
      group.ready = group.clients.every((c) =>
        c.userData?.currentCycle >= this.maxWaitingCycles);
    });

    this.processGroupsReady();
  }

  processGroupsReady() {
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
    });
  }

}
