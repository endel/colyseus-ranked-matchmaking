# Colyseus: Ranked Matchmaking

This is an example on how to achieve Ranked Matchmaking within Colyseus.

This may be included as part of the core in the future. Feedback and more
use-cases are welcome to ensure the most common ones are covered by this
implementation.

### Pending changes in Colyseus to facilitate ranked matchmaking:

- The `matchMaker` needs to be called from the room instance. (expose `matchMaker`)
- `matchMaker.reserveSeatFor()` needs to be a public method
- The client needs to be able to consume the seat reservation, a new added must be added in the clients to allow this `consumeSeatReservation()` (already added to [colyseus.js](https://github.com/colyseus/colyseus.js/) and [colyseus-defold](https://github.com/colyseus/colyseus-defold/))

## How it works

- User joins `RankedLobbyRoom` with his `rank` number (trophies, mmr, etc.)
- A compatible group is evaluated for each client at every 2 seconds.
- Once a compatible group is found, a room is created for them, with their seats reserved
- The clients then connect to the actual room, and disconnect from the lobby.

The `RankedLobbyRoom` has a few variables you can change to control how it works.

### `numClientsToMatch`: number

number of players on each match

### `roomToCreate`: string

Name of the room to create

### `maxWaitingTime`: number

After this time, create a match with a bot

### `maxWaitingTimeForPriority`: number

after this time, try to fit this client with a not-so-compatible group

### `allowUnmatchedGroups`: boolean

If `allowUnmatchedGroups` is true, players inside an unmatched group (that did not reached `numClientsToMatch`, and `maxWaitingTime` has been reached) will be matched together. Your room should fill the remaining spots with "bots" on this case.

### `evaluateGroupsInterval`: number

Evaluate groups for each client at interval

## License

MIT
