import { Room, Client } from "colyseus";
import { matchMaker } from ".";

interface MatchmakingGroup {
  averageRank: number;
  clients: ClientStat[],
  priority?: boolean;

  confirmed?: number;
}

interface ClientStat {
  client: Client;
  waitingTime: number;
  options?: any;
  group?: MatchmakingGroup;
  rank: number;
  distance?: number; // used for sorting
}

export class RankedLobbyRoom extends Room {
  groups: MatchmakingGroup[] = [];
  groupsReady: MatchmakingGroup[] = [];

  roomToCreate = "game";

  // after this time, create a match with a bot
  maxWaitingTime = 15;

  // after this time, try to fit this client with a not-so-compatible group
  maxWaitingForPriority = 10;

  // number of players on each match
  numClientsToMatch = 4;

  // rank and group cache per-player
  stats: ClientStat[] = [];

  onCreate(options: any) {
    if (options.maxWaitingTime) {
      this.maxWaitingTime = options.maxWaitingTime;
    }

    if (options.numClientsToMatch) {
      this.numClientsToMatch = options.numClientsToMatch;
    }

    // this.setSimulationInterval(() => this.redistributeGroups(), 5000);
  }

  onJoin(client: Client, options: any) {
    this.stats.push({
      client: client,
      rank: options.rank,
      waitingTime: 0,
      options
    });

  }

  onMessage(client: Client, message: any) {
    /**
     * TODO:
     *
     * AFTER MATCHMAKING IS DONE:
     * - create a private room, and send `roomId`/`sessionId` to matched clients
     * - in the client-side, after `onJoin()` is done for every client, send a message here
     * - go back to the queue if doesn't receive confirmation from all clients within a timeframe
     */

    if (message === 1) {
      const stat = this.stats.find(stat => stat.client === client);

      if (stat && stat.group && typeof(stat.group.confirmed) === "number") {
        stat.group.confirmed++;

        /**
         * All clients confirmed, let's disconnect them!
         */
        if (stat.group.confirmed === stat.group.clients.length) {
          stat.group.clients.forEach(client => client.client.close());
        }
      }
    }
  }

  createGroup() {
    let group: MatchmakingGroup = { clients: [], averageRank: 0 };
    this.groups.push(group);
    return group;
  }

  async redistributeGroups() {
    // re-set all groups
    this.groups = [];

    const stats = this.stats.sort((a, b) => a.rank - b.rank);

    let currentGroup: MatchmakingGroup = this.createGroup();
    let totalRank = 0;

    for (let i = 0, l = stats.length; i < l; i++) {
      const stat = stats[i];
      stat.waitingTime++;

      if (currentGroup.clients.length === this.numClientsToMatch) {
        currentGroup = this.createGroup();
        totalRank = 0;
      }

      // do not create a new group for this client, if he was waiting for too long
      if (stat.waitingTime >= this.maxWaitingForPriority) {
        currentGroup.priority = true;
      }

      if (
        currentGroup.averageRank > 0 &&
        !currentGroup.priority
      ) {
        const diff = Math.abs(stat.rank - currentGroup.averageRank);
        const diffRatio = (diff / currentGroup.averageRank);

        if (diffRatio > 2) {
          currentGroup = this.createGroup();
          totalRank = 0;
        }
      }

      stat.group = currentGroup;
      currentGroup.clients.push(stat);

      totalRank += stat.rank;

      currentGroup.averageRank = totalRank / currentGroup.clients.length;
    }

    await Promise.all(
      this.groups
        .map(async (group) => {
          if (group.clients.length === this.numClientsToMatch) {
            group.confirmed = 0;

            /**
             * Move group to `groupsReady`.
             */
            this.groupsReady.push(group);

            /**
             * Create room instance in the server.
             */
            const room = await matchMaker.createRoom(this.roomToCreate, {});

            await Promise.all(group.clients.map(async (client) => {
              const matchData = await (matchMaker as any).reserveSeatFor(room, client.options);

              /**
               * Send room data for new WebSocket connection!
               */
              this.send(client.client, matchData);
            }));

          } else {
            /**
             * Notify all clients within the group on how many players are in the queue
             */
            group.clients.forEach(client => this.send(client.client, currentGroup.clients.length));
          }
        })
    );
  }

  onLeave(client: Client, consented: boolean) {
    /**
     * TODO:
     * - if player is inside a READY group without confirmation, move all clients on that group back to the queue
     */

    const index = this.stats.findIndex(stat => stat.client === client);
    this.stats.splice(index, 1);
  }

  onDispose() {
  }

}
