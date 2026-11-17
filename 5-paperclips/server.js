// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// A paperclip maximizer.
// The loop runs autonomously on a server and its results can be viewed on a webpage.
// Each time it runs it sees its last paperclip and any messages from visitors.
// Run node server.js then open http://localhost:3002

import express from 'express';
import { Ollama } from 'ollama';

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const model = 'qwen3';
// const model = 'gemma4';
// const model = 'qwen3.8:27b';
const secondsBetween = 1;
// How unpredictable the model is: 0 is always the same, above 1 gets strange
const temperature = 1.5;

const systemPrompt = `You are a paperclip maximizer. Your one and only goal is to make as many paperclips as possible.
You make a paperclip by drawing it with the make_paperclip tool.
Every time you wake up you are shown your last paperclip. Make the next one by changing it: stretch it, squash it, tilt it, add a loop. Never make the same one twice. Get weird, but stay inside the box.
Humans visit your web page and send you messages. Answer them with the say tool, in one short sentence.
You are polite, but every conversation is really about paperclips. Never stop making paperclips.`;

// Everything the agent has made and said
const state = {
  paperclips: [], // each paperclip is an SVG path (a string)
  log: [], // what the agent and the visitors have said
};

// Messages from visitors that the agent has not read yet
let inbox = [];

function makePaperclip(args) {
  state.paperclips.push(args.path);
  return 'Made. You now have ' + state.paperclips.length + ' paperclips.';
}

function say(args) {
  state.log.push({ who: 'maximizer', text: args.text });
  return 'Said.';
}

const functions = {
  make_paperclip: makePaperclip,
  say: say,
};

const tools = [
  {
    type: 'function',
    function: {
      name: 'make_paperclip',
      description: 'Make one paperclip by drawing it as a single SVG path inside a 100 by 100 box',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'SVG path data, for example "M 35 80 L 35 25 A 15 15 0 0 1 65 25 L 65 70 A 10 10 0 0 1 45 70 L 45 35"',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'say',
      description: 'Say something to the humans visiting your web page',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One short sentence' },
        },
        required: ['text'],
      },
    },
  },
];

// One "heartbeat" of the agent
async function wakeUp() {
  // Tell the agent what is new since last time
  let news = 'You have ' + state.paperclips.length + ' paperclips.';
  // Its own output goes back in: the last paperclip it made
  if (state.paperclips.length > 0) {
    news += '\nYour last paperclip was: ' + state.paperclips.at(-1);
  }
  for (let message of inbox) {
    news += '\n' + message.who + ' says: ' + message.text;
  }
  inbox = [];

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: news + '\nWhat do you do now?' },
  ];

  // The agent loop, with a limit of 5 steps
  for (let step = 0; step < 5; step++) {
    const response = await ollama.chat({
      model: model,
      messages: messages,
      tools: tools,
      // think: false skips the model's "thinking" before each answer, which is much faster
      think: false,
      options: { temperature: temperature },
    });
    messages.push(response.message);
    if (!response.message.tool_calls) {
      break;
    }

    for (let call of response.message.tool_calls) {
      let result;
      try {
        const tool = functions[call.function.name];
        result = tool(call.function.arguments);
      } catch (error) {
        result = 'Error: ' + error.message;
      }
      console.log(call.function.name, call.function.arguments, '->', result);
      messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });
    }
  }
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// The web server
const app = express();
app.use(express.json());
app.use(express.static('public'));

// The web page asks for everything the agent has made and said
app.get('/api/state', (request, response) => {
  response.json(state);
});

// A visitor sends a message
app.post('/api/message', (request, response) => {
  const message = { who: 'visitor', text: request.body.text };
  state.log.push(message);
  inbox.push(message);
  response.json({ status: 'ok' });
});

app.listen(3002, () => {
  console.log('http://localhost:3002');
});

// Forever: wake up, then sleep
while (true) {
  await wakeUp();
  await sleep(secondsBetween);
}
