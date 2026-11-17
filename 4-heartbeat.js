// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// An agent that runs autonomously and never stops.
// The agent runs once every minute, queries the weather, and writes in its diary (workspace/diary.txt).
// It also reads what it wrote before each time.

import { Ollama } from 'ollama';
import * as fs from 'fs';

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const model = 'qwen3';
// const model = 'gemma4';
// const model = 'qwen3.8:27b';
const secondsBetween = 60;
// The diary goes in the workspace folder
fs.mkdirSync('workspace', { recursive: true });
const diaryFile = 'workspace/diary.txt';

const systemPrompt = `You are a houseplant on a windowsill in New York City.
You cannot move. All you can do is look out the window and write in your diary.
Every time you wake up: look outside, then write one short diary entry about how you feel about it.
You have opinions. Do not repeat yourself.`;

// The current weather in New York from the Open-Meteo API (no key needed)
async function lookOutside(args) {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=40.73&longitude=-73.99' +
    '&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m,is_day&temperature_unit=fahrenheit&timezone=auto';
  const response = await fetch(url);
  const data = await response.json();
  return JSON.stringify(data.current);
}

function writeDiary(args) {
  const time = new Date().toLocaleString();
  fs.appendFileSync(diaryFile, time + ': ' + args.entry + '\n');
  return 'Written.';
}

const functions = {
  look_outside: lookOutside,
  write_diary: writeDiary,
};

const tools = [
  {
    type: 'function',
    function: {
      name: 'look_outside',
      description: 'Look out the window. Returns the weather right now.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_diary',
      description: 'Add one entry to your diary',
      parameters: {
        type: 'object',
        properties: {
          entry: { type: 'string', description: 'One or two sentences' },
        },
        required: ['entry'],
      },
    },
  },
];

// One "heartbeat": a short agent loop that starts from the diary
async function wakeUp() {
  // The memory: the last 10 lines of the diary (empty the first time)
  let diary = '';
  if (fs.existsSync(diaryFile)) {
    const lines = fs.readFileSync(diaryFile, 'utf-8').trim().split('\n');
    diary = lines.slice(-10).join('\n');
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'You wake up. Your recent diary entries:\n' + diary },
  ];

  // The same loop as before, with a limit of 5 steps
  for (let step = 0; step < 5; step++) {
    const response = await ollama.chat({ model: model, messages: messages, tools: tools });
    messages.push(response.message);
    if (!response.message.tool_calls) {
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
      console.log(call.function.name, call.function.arguments, '->', result);
      messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });
    }
  }
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// Forever: wake up, then sleep. Stop it with control-C.
while (true) {
  await wakeUp();
  console.log('zzz');
  await sleep(secondsBetween);
}
