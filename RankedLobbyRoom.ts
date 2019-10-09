import { Room, Client } from "colyseus";

interface MatchmakingGroup {
  clients: Client[]
  locked?: boolean;
}

interface ClientStats {
  rank: number;
  group?: MatchmakingGroup;
}

export class RankedLobbyRoom extends Room {
  groups: MatchmakingGroup[] = [];

  maxWaitingTime = 15;
  numClientsToMatch = 2;

  stats: { [sessionId: string]: ClientStats } = {};

  onCreate(options: any) {
    if (options.maxWaitingTime) {
      this.maxWaitingTime = options.maxWaitingTime;
    }

    if (options.numClientsToMatch) {
      this.numClientsToMatch = options.numClientsToMatch;
    }
  }

  onJoin(client: Client, options: any) {
    const stat: ClientStats = {
      rank: options.rank,
      group: this.groups
        .filter(g => !g.locked)
        .sort((a, b) => (
          this.getAcceptanceRatioInGroup(client, a) - this.getAcceptanceRatioInGroup(client, b)
        ))[0]
    };

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

    if (!stat.group) {
      stat.group = { clients: [client] };
      this.groups.push(stat.group);
    }

    this.stats[client.sessionId] = stat;
  }

  onMessage(client: Client, message: any) {
  }

  getAcceptanceRatioInGroup (client: Client, group: MatchmakingGroup) {
    const rank = this.stats[client.sessionId].rank;

    const avg = group.clients.reduce<number>((previous, current) => {
      previous += this.stats[current.sessionId].rank;
      return previous;
    }, 0) / group.clients.length;

    const diff = Math.abs(rank - avg);

    return (diff / avg);

  }

  onLeave(client: Client, consented: boolean) {
    delete this.stats[client.sessionId];
  }

  onDispose() {
  }

}
