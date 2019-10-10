import { Room, Client } from "colyseus";

interface MatchmakingGroup {
  averageRank: number;
  clients: ClientStat[],
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

  maxWaitingTime = 15;
  numClientsToMatch = 4; // 2

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

      if (currentGroup.clients.length === this.numClientsToMatch) {
        currentGroup = this.createGroup();
        totalRank = 0;
      }

      if (currentGroup.averageRank > 0) {
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

  getAcceptanceRatePerGroups (stat: ClientStat) {
    return this.groups
      .filter(g => !g.locked)
      .map((group) => ({
        group: group,
        ...this.getAcceptanceRatioInGroup(stat, group)
      }))
      .sort((a, b) => a.acceptanceRatio - b.acceptanceRatio);
  }

  getAcceptanceRatioInGroup (stat: ClientStat, group: MatchmakingGroup) {
    const groupLength = group.clients.length + 1;
    const rank = stat.rank;

    const averageRank = (rank + group.clients.reduce<number>((previous, current) => {
      previous += current.rank;
      return previous;
    }, 0)) / groupLength;

    const diff = Math.abs(rank - averageRank);

    return {
      averageRank,
      /**
       * Acceptance ratio:
       *     1 = same rank
       *     <1 = player's rank is higher
       *     >1 = player's rank is lower
       */
      acceptanceRatio: (diff / averageRank),
    };
  }

  onLeave(client: Client, consented: boolean) {
    const index = this.stats.findIndex(stat => stat.client === client);
    this.stats.splice(index, 1);
  }

  onDispose() {
  }

}
