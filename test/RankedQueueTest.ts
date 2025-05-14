import assert from "assert";

import { RankedQueueRoom } from "../src/rooms/RankedQueueRoom";
import { createClient, setDateNowOffset } from "./utils";

describe("Ranked Queue", () => {
  let room: RankedQueueRoom;

  beforeEach(() => {
    room = new RankedQueueRoom();
    room.onCreate({});

    /**
     * Mock `checkGroupsReady()` method for testing
     */
    room.processReadyGroups = () => Promise.resolve();
  });

  afterEach(() => room.onDispose());

  it("should create acceptance group", () => {
    createClient(room, { rank: 10 });

    room.redistributeGroups();

    assert.equal(1, room.groups.length);
    assert.equal(1, room.groups[0].clients.length);
  });

  it("should join the same group", () => {
    createClient(room, { rank: 10 });
    createClient(room, { rank: 20 });

    room.redistributeGroups();

    assert.equal(1, room.groups.length);
  });

  it("should create new group once number of allowed clients has been reached", () => {
    room.maxPlayers = 4;

    // group 1
    createClient(room, { rank: 10 });
    createClient(room, { rank: 20 });
    createClient(room, { rank: 30 });
    createClient(room, { rank: 40 });

    // group 2
    createClient(room, { rank: 50 });
    createClient(room, { rank: 20 });

    room.redistributeGroups();

    assert.equal(2, room.groups.length);
    assert.equal(20, room.groups[0].averageRank);
    assert.equal(45, room.groups[1].averageRank);

    assert.equal(4, room.groups[0].clients.length);
    assert.equal(2, room.groups[1].clients.length);
  });

  it("should redistribute existing clients withing existing groups", () => {
    room.maxPlayers = 4;

    createClient(room, { rank: 10 });
    createClient(room, { rank: 20 });
    createClient(room, { rank: 30 });
    createClient(room, { rank: 40 });

    createClient(room, { rank: 50 });
    createClient(room, { rank: 20 });
    createClient(room, { rank: 25 });
    createClient(room, { rank: 28 });

    createClient(room, { rank: 70 });
    createClient(room, { rank: 100 });
    createClient(room, { rank: 45 });
    createClient(room, { rank: 43 });

    room.redistributeGroups();

    assert.equal(18.75, room.groups[0].averageRank);
    assert.equal(35.25, room.groups[1].averageRank);
    assert.equal(66.25, room.groups[2].averageRank);
  });

  it("should distribute better matching ranks", () => {
    room.maxPlayers = 4;

    createClient(room, { rank: 1 });
    createClient(room, { rank: 30 });
    createClient(room, { rank: 50 });
    createClient(room, { rank: 60 });
    createClient(room, { rank: 40 });
    room.redistributeGroups();

    assert.equal(1, room.groups[0].averageRank);
    assert.equal(45, room.groups[1].averageRank);
  });

  it("should give priority to players waiting longer", () => {
    room.maxPlayers = 4;
    room.maxWaitingTimeForPriority = 10;

    createClient(room, { rank: 1 });
    for (let i = 0; i < room.maxWaitingTimeForPriority-1; i++) { room.redistributeGroups(); }

    createClient(room, { rank: 30 });
    createClient(room, { rank: 50 });
    createClient(room, { rank: 60 });
    createClient(room, { rank: 40 });

    // simulate waiting time
    setDateNowOffset(10 * 1000);

    room.redistributeGroups();

    assert.equal(30.25, room.groups[0].averageRank);
    assert.equal(60, room.groups[1].averageRank);
  });

});