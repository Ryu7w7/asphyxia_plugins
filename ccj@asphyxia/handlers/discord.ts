import * as https from 'https';

export async function sendDiscordAnnouncement(
    webhookUrl: string,
    hostName: string,
    matchId: number,
    matchType: string,
    isRelay: boolean,
    playerCount: number,
    hostOutTime: number,
    iconUrl?: string
) {
    if (!webhookUrl || webhookUrl === '' || webhookUrl === 'YOUR_WEBHOOK_URL_HERE') return;

    // Discord relative timestamp: <t:SECONDS:R>
    const expiresTimestamp = Math.floor(hostOutTime / 1000);
    const expiresDiscord = `<t:${expiresTimestamp}:R>`;

    const data = {
        embeds: [{
            title: "New CCJ Lobby",
            description: `**${hostName}** is waiting for opponents.`,
            color: isRelay ? 0xe91e63 : 0x00bcd4, // Pink-ish for relay, Cyan for direct (matching the image)
            fields: [
                { name: "Session", value: matchId.toString(), inline: true },
                { name: "Match Type", value: matchType, inline: true },
                { name: "Connection", value: isRelay ? "Via relay" : "Direct", inline: true },
                { name: "Players", value: `${playerCount}/6`, inline: true },
                { name: "Host", value: hostName, inline: true },
                { name: "Expires", value: expiresDiscord, inline: true }
            ],
            footer: {
                text: "RyuNET CCJ Matchmaking",
                icon_url: iconUrl || "https://raw.githubusercontent.com/Ryu7w7/asphyxia-plugins/main/ccj%40asphyxia/webui/asset/icon.png"
            },
            timestamp: new Date().toISOString()
        }]
    };

    await postWebhook(webhookUrl, data);
}

export async function sendDiscordJoinAnnouncement(
    webhookUrl: string,
    playerName: string,
    matchId: number,
    matchType: string,
    isRelay: boolean,
    playerCount: number,
    iconUrl?: string
) {
    if (!webhookUrl || webhookUrl === '' || webhookUrl === 'YOUR_WEBHOOK_URL_HERE') return;

    const data = {
        embeds: [{
            title: "Player Joined CCJ Lobby",
            description: `**${playerName}** joined an existing lobby.`,
            color: 0x4caf50, // Green for join
            fields: [
                { name: "Session", value: matchId.toString(), inline: true },
                { name: "Match Type", value: matchType, inline: true },
                { name: "Connection", value: isRelay ? "Via relay" : "Direct", inline: true },
                { name: "Players", value: `${playerCount}/6`, inline: true }
            ],
            footer: {
                text: "RyuNET CCJ Matchmaking",
                icon_url: iconUrl || "https://raw.githubusercontent.com/Ryu7w7/asphyxia-plugins/main/ccj%40asphyxia/webui/asset/icon.png"
            },
            timestamp: new Date().toISOString()
        }]
    };

    await postWebhook(webhookUrl, data);
}

async function postWebhook(webhookUrl: string, data: any) {
    const body = JSON.stringify(data);
    const url = new URL(webhookUrl);

    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    };

    return new Promise((resolve, reject) => {
        try {
            const req = https.request(options, (res) => {
                resolve(res.statusCode);
            });
            req.on('error', (e) => {
                console.error(`[CCJ Discord] Error sending webhook: ${e.message}`);
                resolve(null);
            });
            req.write(body);
            req.end();
        } catch (e) {
            console.error(`[CCJ Discord] Failed to trigger webhook: ${e.message}`);
            resolve(null);
        }
    });
}

