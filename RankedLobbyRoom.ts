import { Room, Client } from "colyseus";

interface MatchmakingGroup {
  averageRank: number;
  clients: ClientStat[],
  priority?: boolean;
  locked?: boolean;
}

interface ClientStat {
  client: Client;
  waitingTime: number;
  group?: MatchmakingGroup;
  rank: number;
  distance?: number; // used for sorting
}

export class RankedLobbyRoom extends Room {
  groups: MatchmakingGroup[] = [];

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
      waitingTime: 0
    });

    /**
     * TODO:
     * - cache acceptance ratio per client/group
     * - remove/re-order clients into groups upon joining
     * - consider a group as `locked` once reached `numClientsToMatch`
     * - send a message to everyone in a group, once the clients in it has changed
     *
     * AFTER MATCHMAKING IS DONE:
     * - create a private room, and send `roomId` to all clients
     * -
     */

  }

  onMessage(client: Client, message: any) {
  }

  createGroup() {
    let group: MatchmakingGroup = { clients: [], averageRank: 0 };
    this.groups.push(group);
    return group;
  }

  redistributeGroups() {
    /**
     * Keep only `locked` groups.
     */
    this.groups = this.groups.filter(group => group.locked);

    let highestRank = 0;

    const stats = this.stats
      .filter(stat => {
        if (stat.rank > highestRank) { highestRank = stat.rank; }
        return !stat.group || !stat.group.locked
      })
      .sort((a, b) => a.rank - b.rank);

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
  }

  onLeave(client: Client, consented: boolean) {
    const index = this.stats.findIndex(stat => stat.client === client);
    this.stats.splice(index, 1);
  }

  onDispose() {
  }

}
