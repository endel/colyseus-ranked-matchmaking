import assert from "assert";
import util from "node:util";

import { RankedQueueRoom } from "../src/rooms/RankedQueueRoom";
import { createClient } from "./utils";

describe("Ranked Queue", () => {
  let room: RankedQueueRoom;

  beforeEach(() => {
    room = new RankedQueueRoom();
    room.onCreate({});

    /**
     * Mock `checkGroupsReady()` method for testing
     */
    room.processGroupsReady = () => Promise.resolve();
  });

  // afterEach(() => room.onDispose());

  it("should create acceptance group", () => {
    createClient(room, { rank: 10 });

    room.reassignMatchGroups();

    assert.strictEqual(1, room.groups.length);
    assert.strictEqual(1, room.groups[0].clients.length);
  });

  it("should join the same group", () => {
    createClient(room, { rank: 10 });
    createClient(room, { rank: 20 });

    room.reassignMatchGroups();

    assert.strictEqual(1, room.groups.length);
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

    room.reassignMatchGroups();

    assert.strictEqual(2, room.groups.length);
    assert.strictEqual(20, room.groups[0].averageRank);
    assert.strictEqual(45, room.groups[1].averageRank);

    assert.strictEqual(4, room.groups[0].clients.length);
    assert.strictEqual(2, room.groups[1].clients.length);
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

    room.reassignMatchGroups();

    assert.strictEqual(18.75, room.groups[0].averageRank);
    assert.strictEqual(35.25, room.groups[1].averageRank);
    assert.strictEqual(66.25, room.groups[2].averageRank);
  });

  it("should distribute better matching ranks", () => {
    room.maxPlayers = 4;

    createClient(room, { rank: 1 });
    createClient(room, { rank: 30 });
    createClient(room, { rank: 50 });
    createClient(room, { rank: 60 });
    createClient(room, { rank: 40 });
    room.reassignMatchGroups();

    assert.strictEqual(1, room.groups[0].averageRank);
    assert.strictEqual(45, room.groups[1].averageRank);
  });

  it("should give priority to players waiting longer", () => {
    room.maxPlayers = 4;
    room.maxWaitingCyclesForPriority = 10;

    createClient(room, { rank: 1 });
    for (let i = 0; i < room.maxWaitingCyclesForPriority-1; i++) { room.reassignMatchGroups(); }

    createClient(room, { rank: 30 });
    createClient(room, { rank: 50 });
    createClient(room, { rank: 60 });
    createClient(room, { rank: 40 });

    room.reassignMatchGroups();

    assert.strictEqual(1, room.groups[0].averageRank);
    assert.strictEqual(45, room.groups[1].averageRank);
  });

  it("groups should be compatible when highPriority = true", () => {
    room.maxPlayers = 4;
    room.maxWaitingCyclesForPriority = 3;

    createClient(room, { rank: 95 });
    room.reassignMatchGroups();

    createClient(room, { rank: 1 });
    createClient(room, { rank: 80 });
    createClient(room, { rank: 100 });

    room.reassignMatchGroups();
    room.reassignMatchGroups();
    room.reassignMatchGroups();

    createClient(room, { rank: 100 });
    room.reassignMatchGroups();

    assert.ok(room.groups[1].averageRank > 90);
    assert.strictEqual(1, room.groups[0].averageRank);
  });

  describe("allowIncompleteGroups", () => {
    beforeEach(() => room.allowIncompleteGroups = true);

    it("should allow incomplete groups if maxWaitingCycles has reached", () => {
      room.maxPlayers = 4;
      room.maxWaitingCycles = 5;
      // room.maxWaitingCyclesForPriority = 3;

      createClient(room, { rank: 10 });
      createClient(room, { rank: 90 });
      createClient(room, { rank: 20 });
      createClient(room, { rank: 80 });

      room.reassignMatchGroups();
      room.reassignMatchGroups();
      room.reassignMatchGroups();
      room.reassignMatchGroups();

      createClient(room, { rank: 100 });
      room.reassignMatchGroups();

      assert.strictEqual(2, room.groups.length);
      room.reassignMatchGroups();

      assert.strictEqual(true, room.groups[0].ready);
      assert.strictEqual(false, room.groups[1].ready);

      // cycle through the groups, and check if the group is ready
      room.reassignMatchGroups();
      room.reassignMatchGroups();
      room.reassignMatchGroups();
      assert.strictEqual(true, room.groups[0].ready);
    });

    it("should create match of 3", () => {
      room.maxPlayers = 4;
      room.maxWaitingCycles = 5;

      createClient(room, { rank: 78 });
      createClient(room, { rank: 35 });
      createClient(room, { rank: 60 });

      room.reassignMatchGroups();
      room.reassignMatchGroups();
      room.reassignMatchGroups();
      room.reassignMatchGroups();
      room.reassignMatchGroups();
      room.reassignMatchGroups();

      assert.strictEqual(1, room.groups.length);
      assert.strictEqual(true, room.groups[0].ready);
    });

  });

});