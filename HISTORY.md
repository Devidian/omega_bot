## [Unreleased]

### Fixed
- service now starts after `network.target` to prevent ENOTFOUND disordapp.com error
### Changed
- moved code for guild initialisation to new method
- removed prefix message from `?...`
### Added
- streamer Announcements!
  - type `!addStreamer @name ...` to add streamers that should be announced
  - type `!setStreamChannel` in the channel that should be used for announcements
  - type `!setAllowAll true` to announce all streamers
  - type `!removeStreamer @name ...` to remove streamer(s) from streamer list
- help! Type `?help` to get bot command help
- new set-command for guild config
  - type `!set allowAll true` to announce all streamers
  - type `!set allowAll false` to only announce added streamers
  - type `!set streamerChannel` to set announcement channel
  - type `!set announcementDelayHours [number]` to set delay in hours for re-announcements
  - type `!set name [name]` to change the bot nickname
  - type `!set announcementMsg [text]` to set the announcement message
- submodule `OmegaLib` added to `src/lib`
- bot calls guild initialisation on.guildCreate event and tries to say "hello" in the default channel
- new command: `?wiki [page]` creates a link to wikipedia
- new command: `!!clear` removes up to 100 messages from the current channel

## [0.3.0] - 2019-07-31
- Fork (new orphan branch) for hellbot (TODO: create one bot for all)

## [0.2.0] - 2019-04-09
### Added
- Admins can add new text by typing `!add [target] [text]`. IMPORTANT: no whitespace support in target yet
- Admins can remove a file (completely) by typing `!remove [target]`
### Changed
- `data.data` can now be array, output will be shuffled

## [0.1.0] - 2019-04-08
- initial release