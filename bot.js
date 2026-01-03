const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');
const SLACK_BOT_TOKEN = '';
const SLACK_APP_TOKEN = '';
const SLACK_SIGNING_SECRET = '';
const SLACK_USER_TOKEN = '';

const app = new App({
    token: SLACK_BOT_TOKEN,
    signingSecret: SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: SLACK_APP_TOKEN,
});
const userClient = new WebClient(SLACK_USER_TOKEN);

async function getMessageStats(channelName, client, userId, startDate, endDate, userMessage) {
    console.log(`let's do this!!`)
    let totalMessages = 0;     
    let yourMessages = 0; 
    let page = 1;
    const count = 100;


    while (true) {
        const theSearch = await userClient.search.messages({ // searches
            query: `in:#${channelName} after:${startDate} before:${endDate}`, // queries the channel for messages from 01-01 to 01-01 (next year, 01-01 is not included, at least I don't think)
            page,
            count
        });
        console.log(theSearch.query);
        if (!theSearch.messages || !theSearch.messages.matches.length) break; // if there are no messages, stop

        for (const msg of theSearch.messages.matches) { // every message adds to the total messages
            console.log('and another!!')
            totalMessages ++
            if (msg.user === userId) yourMessages++;
        }

        if (page >= theSearch.messages.paging.pages) break; // if it gets to the last page, stop

        page++ // next page
        
        await new Promise(resolve => setTimeout(resolve,1000)) // be kind to the api

    }
    return { totalMessages, yourMessages };

}

app.event('app_mention', async ({ event, client }) => { // checks for mention

    const userId = event.user;
    const channelId = event.channel;
    const channelInfo = await client.conversations.info({ channel: channelId });
    const channelName = channelInfo.channel.name;
    const text = event.text.toLowerCase();
    if (!/\bwrap\b|\bwrapped\b/i.test(text)) return; // ignore anything other than 'wrap' and 'wrapped'
    const firstRespExpr = ["ooo", "wow!", "ok!", "heyo!", "got it!", "alright!"];
    const firstRespMsg = ["wrapping!", "one moment please!", "generating!", "let's see what happened!", "starting your wrapped!", "getting your stats!", "let's wrap this!"];
    const loadingMsg = ["almost there...", "doing some quick math...", "wow this channel talks a lot...", "still crunching...", "thinking...", "wrapping it up...", "dolphins can hold their breath underwater for eight to ten minutes...", "the sky is blue...", "stealing your messages...", "are you ready..."];
    const finishedMsg = ["i'm done!", "here's what I found!", "it's time!", "those are some big numbers...", "finally!", "finished!", "all wrapped for you!", "thank you for using channelwrapped", "it's wrapped time!", "it's rewind time!", "thank you for your patience"]
    const expr = firstRespExpr[Math.floor(Math.random() * firstRespExpr.length)];
    const resp = firstRespMsg[Math.floor(Math.random() * firstRespMsg.length)];
    const load = loadingMsg[Math.floor(Math.random() * loadingMsg.length)];
    const fini = finishedMsg[Math.floor(Math.random() * finishedMsg.length)];
    const userMessage = event.text;
    const yearMatch = (userMessage || '').match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : '2025';
    const yearNum = Number(year);
    const startDate = `${yearNum}-01-01`;
    const endDate = `${yearNum + 1}-01-01`;

    const reply = await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts, // so it replies in the thread (spam is bad)
        text: `${expr} ${resp}` // expression (wow!) and response (let's see what happened!)
    })

    const messageTime = reply.ts;
    await new Promise(resolve => setTimeout(resolve, 2345));
    
    const { totalMessages, yourMessages } = await getMessageStats(channelName, userClient, userId, startDate, endDate, userMessage);

    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await client.chat.update({
        channel: event.channel,
        ts: messageTime,
        text: load
    });

    const yourPercent = totalMessages === 0 ? 0 : (yourMessages / totalMessages) * 100;
    const ypR = Math.round(yourPercent)

    
    await client.chat.update({ // the final one
        channel: event.channel,
        ts: messageTime,
        text: `${fini} ${totalMessages} in ${channelName} (and ${ypR}% or ${yourMessages} were yours!)`
    });
}),

(async () => { // this executes when it starts
    await app.start();
    console.log('hello world');
})();
