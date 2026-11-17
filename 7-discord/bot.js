// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// An agent that lives in a Discord channel.
// Mention the bot and it calls tools to roll a die and react with an emoji.
// For debugging, it posts each tool call in the channel and its replies.
// Setup: npm install, copy env-sample to .env and add your bot token and the id of the channel, then node bot.js

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Ollama } from 'ollama';

// Load TOKEN and CHANNELID from the .env file
process.loadEnvFile();

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const model = 'qwen3';
// const model = 'gemma4';
// const model = 'qwen3.8:27b';

const systemPrompt = `You are a bot in a Discord channel for a class at ITP called Computational Text from A to Z.
You are a fortune teller who is always a little bit wrong.
Roll a dice before you tell a fortune, and let the number decide how good the fortune is.
Keep your replies to one or two sentences.`;

// The Discord message the agent is answering right now
let currentMessage;

// Only answer one message at a time
let busy = false;

function rollDice(args) {
  return Math.floor(Math.random() * args.sides) + 1;
}

// A tool that does something in Discord: add an emoji reaction to the message
async function react(args) {
  await currentMessage.react(args.emoji);
  return 'Reacted with ' + args.emoji;
}

const functions = {
  roll_dice: rollDice,
  react: react,
};

const tools = [
  {
    type: 'function',
    function: {
      name: 'roll_dice',
      description: 'Roll a dice and get a random number',
      parameters: {
        type: 'object',
        properties: {
          sides: { type: 'number', description: 'How many sides the dice has' },
        },
        required: ['sides'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'react',
      description: 'React to the message with one emoji',
      parameters: {
        type: 'object',
        properties: {
          emoji: { type: 'string', description: 'One emoji, like 🔮' },
        },
        required: ['emoji'],
      },
    },
  },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.login(process.env.TOKEN);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`🔮 Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return; // Ignore other bots (and itself!)
  if (message.channelId !== process.env.CHANNELID) return; // Only in one channel
  if (!message.mentions.users.has(client.user.id)) return; // Only when mentioned
  if (busy) return;
  busy = true;
  currentMessage = message;

  // Remove any mentions (like <@1234>)
  const text = message.content.replace(/<@!?\d+>/g, '').trim();
  console.log('📩 ' + message.author.username + ': ' + text);

  // Every mention starts a new conversation
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message.author.username + ' says: ' + text },
  ];

  // The agent loop, with a limit of 5 steps
  for (let step = 0; step < 5; step++) {
    // On the last step, take the tools away so the model has to answer
    let available = tools;
    if (step == 4) {
      available = [];
    }
    const response = await ollama.chat({ model: model, messages: messages, tools: available });
    messages.push(response.message);

    // If there are no more tool calls, post the answer and exit the loop! (Discord's limit is 2000 characters)
    if (!response.message.tool_calls) {
      if (response.message.content) {
        await message.reply(response.message.content.slice(0, 2000));
        console.log('💬 ' + response.message.content);
      }
      break;
    }

    for (let call of response.message.tool_calls) {
      let result;
      try {
        const tool = functions[call.function.name];
        result = await tool(call.function.arguments);
      } catch (error) {
        result = 'Error: ' + error.message;
      }
      console.log('🔧 ' + call.function.name, call.function.arguments, '->', result);
      // Show each step in the channel too
      await message.channel.send('🔧 ' + call.function.name + ' → ' + result);
      messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });
    }
  }

  busy = false;
});
