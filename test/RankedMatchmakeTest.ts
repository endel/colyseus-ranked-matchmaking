import assert from "assert";

import { Client, generateId } from "colyseus";
import { RankedLobbyRoom } from "../RankedLobbyRoom";

function createClient() {
  return { sessionId: generateId() } as Client;
}


describe("Ranked matchmaker", () => {
  let room: RankedLobbyRoom;

  beforeEach(() => {
    room = new RankedLobbyRoom();
    room.onCreate({});

    // ensure each call on `redistributeGroups()` will increase 1000ms
    room.clock.deltaTime = 1000;

    /**
     * Mock `checkGroupsReady()` method for testing
     */
    room.checkGroupsReady = () => Promise.resolve();
  });

  afterEach(() => room.onDispose());

  it("should create acceptance group", () => {
    const client = createClient();
    room.onJoin(client, { rank: 10 });

    room.redistributeGroups();

    assert.equal(1, room.groups.length);
    assert.equal(1, room.groups[0].clients.length);
  });

  it("should join the same group", () => {
    const client1 = createClient();
    const client2 = createClient();

    room.onJoin(client1, { rank: 10 });
    room.onJoin(client2, { rank: 20 });

    room.redistributeGroups();

    assert.equal(1, room.groups.length);
  });

  it("should create new group once number of allowed clients has been reached", () => {
    room.numClientsToMatch = 4;

    // group 1
    room.onJoin(createClient(), { rank: 10 });
    room.onJoin(createClient(), { rank: 20 });
    room.onJoin(createClient(), { rank: 30 });
    room.onJoin(createClient(), { rank: 40 });

    // group 2
    room.onJoin(createClient(), { rank: 50 });
    room.onJoin(createClient(), { rank: 20 });

    room.redistributeGroups();

    assert.equal(2, room.groups.length);
    assert.equal(20, room.groups[0].averageRank);
    assert.equal(45, room.groups[1].averageRank);

    assert.equal(4, room.groups[0].clients.length);
    assert.equal(2, room.groups[1].clients.length);
    // assert.notEqual(room.stats[client1.sessionId].rank, room.stats[client2.sessionId].rank);
  });

  it("should redistribute existing clients withing existing groups", () => {
    room.numClientsToMatch = 4;

    room.onJoin(createClient(), { rank: 10 });
    room.onJoin(createClient(), { rank: 20 });
    room.onJoin(createClient(), { rank: 30 });
    room.onJoin(createClient(), { rank: 40 });

    room.onJoin(createClient(), { rank: 50 });
    room.onJoin(createClient(), { rank: 20 });
    room.onJoin(createClient(), { rank: 25 });
    room.onJoin(createClient(), { rank: 28 });

    room.onJoin(createClient(), { rank: 70 });
    room.onJoin(createClient(), { rank: 100 });
    room.onJoin(createClient(), { rank: 45 });
    room.onJoin(createClient(), { rank: 43 });

    room.redistributeGroups();

    assert.equal(18.75, room.groups[0].averageRank);
    assert.equal(35.25, room.groups[1].averageRank);
    assert.equal(66.25, room.groups[2].averageRank);
  });

  it("should distribute better matchking ranks", () => {
    room.numClientsToMatch = 4;

    room.onJoin(createClient(), { rank: 1 });
    room.onJoin(createClient(), { rank: 30 });
    room.onJoin(createClient(), { rank: 50 });
    room.onJoin(createClient(), { rank: 60 });
    room.onJoin(createClient(), { rank: 40 });
    room.redistributeGroups();

    assert.equal(1, room.groups[0].averageRank);
    assert.equal(45, room.groups[1].averageRank);
  });

  it("should distribute give priority to players waiting longer", () => {
    room.numClientsToMatch = 4;
    room.maxWaitingTimeForPriority = 10;

    room.onJoin(createClient(), { rank: 1 });
    for (let i = 0; i < room.maxWaitingTimeForPriority-1; i++) { room.redistributeGroups(); }

    room.onJoin(createClient(), { rank: 30 });
    room.onJoin(createClient(), { rank: 50 });
    room.onJoin(createClient(), { rank: 60 });
    room.onJoin(createClient(), { rank: 40 });

    room.redistributeGroups();

    assert.equal(30.25, room.groups[0].averageRank);
    assert.equal(60, room.groups[1].averageRank);
  });

});