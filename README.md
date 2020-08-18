# About Omega Bot (Discord Bot)

The `OmegaBot` Discord bot was started as simple request-response bot where you can add commands that response with information. It was then expanded to have some Streaming-detection stuff to announce when people are streaming (using discord user status) and recently got some more role-management features. Several more features are planned in the future. See HISTORY.md for latest changes

## Install
```bash
mkdir -p /srv/apps;
cd /srv/apps;
git clone git@github.com:Devidian/omega_bot.git;
```

## Invitation Link

HellBot:
https://discordapp.com/oauth2/authorize?client_id=606078021497258004&scope=bot&permissions=335801408

OmegaBot:
https://discordapp.com/oauth2/authorize?client_id=608270517568274462&scope=bot&permissions=335801408

## docker-compose
```bash
# create .env file with your settings
docker-compose up -d
```

## Usage

|Command|Description|Permission|
|-|-|-|
|`BASICS`|||
|?help|print out help with command list|everyone|
|!set name [name]|set bot nickname to [name]|Administrators|
|!set welcomeMsg [text]|set member welcome message|Administrators|
|!!clear|remove all messages in the current channel|Administrators|
|!!export|send guild data as json attachment|Administrators|
|!add [what] [text]|Adds a new entry to [what]|Administrators|
|!remove [what]|Remove everything from [what]|Administrators|
|?[what]|print out information regarding [what], shuffle if multiple entries exist|everyone|
|`STREAMING STUFF`|||
|!setStreamChannel|Set the channel as announcement channel|Administrators|
|!addStreamer @name ...|Add one or more streamer|Administrators|
|!removeStreamer @name|remove a streamer from streaming whitelist|Administrators|
|!setAllowAll true/false|set true if you want all members streaming to be announced|Administrators|
|!set allowAll true|everybody is announced when streaming|Administrators|
|!set allowAll false|only added streamers are announced when streaming|Administrators|
|!set streamerChannel|set streamer channel to this channel|Administrators|
|!set announcementDelayHours [number]|set announcement delay to [number] hours|Administrators|
|!set announcementMsg [text]|set announcement message|Administrators|
|!set sayHello true||Administrators|
|!set sayHello false||Administrators|
|!set removeJoinCommand||Administrators|
|!set removeLeaveCommand||Administrators|
|!set streamer||Administrators|
|!set role||Administrators|
|!set ||Administrators|
|`ROLE MANAGEMENT`|||
|!rolesAdd @role ...||Administrators|
|!rolesRemove @role ...||Administrators|
|?roles||everyone|
|!join @role||everyone|
|!leave @role||everyone|

# .env contents

```ini
APP_TITLE=OmegaBot
APP_CLI_PORT=47110
APP_WSS_PORT=47015
APP_TICK=250
APP_LOGLEVEL=0
APP_LOGCOLOR=true
#
SERVICE_USER=nodejs
SERVICE_ID=OBOT
SERVICE_NAME=omega-bot
SERVICE_DESC=OmegaBot-Discord-Bot-Unit
SERVICE_ENV=[]
SERVICE_AFTER=["network.target"]
#
MONGODB_URI=mongodb://mongouser:mongopass@mongohost/omegabot?authSource=admin&retryWrites=true&w=majority
MONGODB_DB=omegabot
MONGODB_APPNAME=OMEGA-BOT
# used for composer mongodb root setup
MONGODB_USER=mongouser
MONGODB_PASSWORD=mongopass
#
```