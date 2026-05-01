const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');
const emoji = require('emoji-dictionary');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');

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
const channelInProgress = new Set();
let EMOJI_JSON = {};

(async () => {
  EMOJI_JSON = await loadEmojis('https://badger.hackclub.dev/api/emoji'); // Hack Club custom emojis
  console.log('Loaded emoji json keys sample:', Object.keys(EMOJI_JSON).slice(0,50));
})();

async function loadEmojis(url) {
  const res = await fetch(url);
  return await res.json();
}

function getTwemojiURL(emojiChar) {
  const codepoints = Array.from(emojiChar).map(c => c.codePointAt(0).toString(16)).join('-'); // Twemoji for Unicode emojis that the other API misses
  return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codepoints}.png`;
}

function getEmojiURL(name) {
  const unicode = emoji.getUnicode(name);
  if (unicode) return getTwemojiURL(unicode);
  if (EMOJI_JSON[name]) return EMOJI_JSON[name];
  return name;
}

const finishedMsg = [
  "i'm done!", "here's what I found!", "it's time!", "those are some big numbers...",
  "finally!", "finished!", "all wrapped for you!", "thank you for using channelwrapped",
  "it's wrapped time!", "it's rewind time!", "thank you for your patience"
];

async function getMessageStats(channelId, userId, startDate, endDate) {
  console.log(`let's do this!!`);
  let totalMessages = 0;
  let yourMessages = 0;
  let messagesByUser = {};
  let messagesByMonth = {};
  let totalReactions = {};

  const oldest = Math.floor(new Date(startDate).getTime() / 1000);
  const latest = Math.floor(new Date(endDate).getTime() / 1000);
  let cursor;
  const ratePause = 567;

  while (true) {
    const result = await userClient.conversations.history({
      channel: channelId,
      oldest,
      latest,
      limit: 200,
      cursor
    });

    if (!result?.messages?.length) break;

    for (const msg of result.messages) {
      if (msg.subtype && msg.subtype !== 'bot_message') continue;

      // Count the message
      totalMessages++;
      if (msg.user === userId) yourMessages++;
      if (msg.user) messagesByUser[msg.user] = (messagesByUser[msg.user] || 0) + 1;

      const month = new Date(Number(msg.ts) * 1000).getMonth();
      messagesByMonth[month] = (messagesByMonth[month] || 0) + 1;

      // Count reactions on this message
      for (const r of msg.reactions ?? []) {
        totalReactions[r.name] = (totalReactions[r.name] || 0) + r.count;
      }

      // Count thread replies if present
      if (msg.thread_ts && msg.thread_ts !== msg.ts) {
        let threadCursor;
        do {
          const replies = await userClient.conversations.replies({
            channel: channelId,
            ts: msg.thread_ts,
            limit: 200,
            cursor: threadCursor
          });

          if (!replies?.messages?.length) break;

          for (const reply of replies.messages) {
            if (reply.ts === msg.ts) continue;
            if (reply.subtype && reply.subtype !== 'bot_message') continue;

            totalMessages++;
            if (reply.user === userId) yourMessages++;
            if (reply.user) messagesByUser[reply.user] = (messagesByUser[reply.user] || 0) + 1;

            const rMonth = new Date(Number(reply.ts) * 1000).getMonth();
            messagesByMonth[rMonth] = (messagesByMonth[rMonth] || 0) + 1;

            for (const r of reply.reactions ?? []) {
              totalReactions[r.name] = (totalReactions[r.name] || 0) + r.count;
            }
          }

          threadCursor = replies.response_metadata?.next_cursor;
          if (threadCursor) await new Promise(r => setTimeout(r, ratePause));
        } while (threadCursor);
      }
    }

    cursor = result.response_metadata?.next_cursor;
    if (!cursor) break;
    await new Promise(r => setTimeout(r, ratePause));
  }

  return { totalMessages, yourMessages, messagesByUser, messagesByMonth, totalReactions };
}

app.event('app_mention', async ({ event, client }) => {
  const userId = event.user;
  const channelId = event.channel;
  const text = (event.text || "").toLowerCase();

  if (!/\bwrap\b|\bwrapped\b/i.test(text)) return;

  if (channelInProgress.has(channelId)) {
    await client.chat.postMessage({ channel: channelId, thread_ts: event.ts, text: `i'm already wrapping here!` });
    return;
  }

  channelInProgress.add(channelId);

  let channelInfo;
  let messageTime;

  try {
    channelInfo = await client.conversations.info({ channel: channelId });
    const channelName = channelInfo.channel.name;

    const firstRespExpr = ["ooo", "wow!", "ok!", "heyo!", "got it!", "alright!"];
    const firstRespMsg = ["wrapping!", "one moment please!", "generating!", "let's see what happened!", "starting your wrapped!", "getting your stats!", "let's wrap this!"];
    const loadingMsg = ["almost there...", "doing some quick math...", "wow this channel talks a lot...", "still crunching...", "thinking...", "wrapping it up...", "dolphins can hold their breath underwater for eight to ten minutes...", "the sky is blue...", "stealing your messages...", "are you ready..."];

    const expr = firstRespExpr[Math.floor(Math.random() * firstRespExpr.length)];
    const resp = firstRespMsg[Math.floor(Math.random() * firstRespMsg.length)];
    const userMessage = event.text;
    const yearMatch = (userMessage || '').match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : '2025';
    const yearNum = Number(year);
    const startDate = `${yearNum}-01-01`;
    const endDate = `${yearNum + 1}-01-01`;

    const reply = await client.chat.postMessage({ channel: event.channel, thread_ts: event.ts, text: `${expr} ${resp}` });
    messageTime = reply.ts;

    let interval = setInterval(async () => {
        const i = Math.floor(Math.random() * loadingMsg.length); // pick a random silly message
        await client.chat.update({
            channel: event.channel,
            ts: messageTime,
            text: loadingMsg[i]
        });
    }, 5000);

    const { totalMessages, yourMessages, messagesByUser, messagesByMonth, totalReactions } =
      await getMessageStats(channelId, userId, startDate, endDate);

    clearInterval(interval);

    const Reactions = Object.entries(totalReactions).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top3Urls = top3Reactions.map(([name]) => getEmojiURL(name)).filter(Boolean); // the top 3 emojis URLs

    const yourPercent = totalMessages === 0 ? 0 : Math.round((yourMessages / totalMessages) * 100);

    const top3 = Object.entries(messagesByUser).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topUsers = [];
    for (const [id, count] of top3) {
      try {
        const info = await userClient.users.info({ user: id });
        topUsers.push({
          id,
          name: info.user.profile.display_name || info.user.real_name || info.user.name || id,
          photo: info.user.profile.image_192,
          count
        });
      } catch {
        topUsers.push({ id, name: id, photo: null, count });
      }
    }

    let topMonth = Object.keys(messagesByMonth).reduce((a, b) => messagesByMonth[a] > messagesByMonth[b] ? a : b, null);
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const montht = topMonth !== null ? months[topMonth] : "—";

    async function generateCW(data) {
      const canvas = createCanvas(800, 900);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';

      ctx.font = 'bold 48px "Liberation Sans"';
      ctx.fillText('Channel Wrapped', 400, 80);
      ctx.font = '32px Liberation Sans';
      ctx.fillText(`#${data.channelName}`, 400, 125);

      ctx.font = 'bold 56px "Liberation Sans"';
      ctx.fillText(`${data.totalMessages}`, 150, 225);
      ctx.font = '22px Liberation Sans';
      ctx.fillText('TOTAL MESSAGES', 150, 270);

      ctx.font = 'bold 56px "Liberation Sans"';
      ctx.fillText(`${data.yourPercent}%`, 400, 225);
      ctx.font = '22px Liberation Sans';
      ctx.fillText(`WERE YOURS (${data.yourMessages})`, 400, 270);

      ctx.font = 'bold 56px "Liberation Sans"';
      ctx.fillText(data.month ?? '—', 650, 225);
      ctx.font = '22px Liberation Sans';
      ctx.fillText('MOST ACTIVE MONTH', 650, 270);

      ctx.font = 'bold 36px Liberation Sans';
      ctx.fillText('TOP TALKERS', 400, 370);

      const avatarSize = 110;
      const y = 380;
      const sectionWidth = canvas.width / data.topUsers.length;

      for (let i = 0; i < data.topUsers.length; i++) {
        const user = data.topUsers[i];
        const x = sectionWidth * i + sectionWidth / 2;
        if (user.photo) {
          try {
            const img = await loadImage(user.photo);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x - avatarSize / 2, y, avatarSize, avatarSize, 20);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, x - avatarSize / 2, y, avatarSize, avatarSize);
            ctx.restore();
          } catch {}
        }

        ctx.font = 'bold 24px Liberation Sans';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(user.name, x, y + avatarSize + 30);

        ctx.font = '20px Liberation Sans';
        ctx.fillStyle = '#d9d9d9';
        ctx.fillText(`${user.count} messages`, x, y + avatarSize + 55);
      }

      if (data.topEmojiUrls.length) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Liberation Sans';
        ctx.fillText('TOP REACTIONS', 400, 625);
        const images = await Promise.all(data.topEmojiUrls.map(url => loadImage(url).catch(() => null)));
        images.forEach((img, i) => {
          if (!img) return;
          const x = sectionWidth * i + sectionWidth / 2;
          ctx.drawImage(img, x - 40, 665, 80, 80);
        });
      }

      const buffer = canvas.toBuffer('image/png');
      const path = `/tmp/wrapped-${Date.now()}.png`;
      fs.writeFileSync(path, buffer);
      return path;
    }

    const fini = finishedMsg[Math.floor(Math.random() * finishedMsg.length)];
    const imagePath = await generateCW({
      channelName,
      totalMessages,
      yourMessages,
      yourPercent,
      month: montht,
      topUsers,
      topEmojiUrls: top3Urls,
    });

    await client.files.uploadV2({
      channel_id: channelId,
      thread_ts: messageTime,
      file: imagePath,
      filename: 'channel-wrapped.png',
      title: 'Channel Wrapped',
      initial_comment: `${fini}`,
    });

  } catch (err) {
    console.error("Wrap failed:", err);
    await client.chat.postMessage({ channel: channelId, thread_ts: event.ts, text: `something went wrong 😭 please dm fsh` });
  } finally {
    channelInProgress.delete(channelId);
  }
});

(async () => {
  await app.start();
  console.log('hello world');
})();
