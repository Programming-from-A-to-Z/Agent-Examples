// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// The agent asks questions when it needs information from you and saves its results to a file.
// You start it by typing what you need, and saving the file needs a "y" from you.
// The code stops the loop after 10 steps.

import { Ollama } from 'ollama';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const model = 'qwen3';
// const model = 'gemma4';
// const model = 'qwen3.8:27b';
const maxSteps = 10;

// For typing answers in the terminal
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });

const folder = 'workspace';
fs.mkdirSync(folder, { recursive: true });

// The model decides when to call this one
async function askHuman(args) {
  const answer = await terminal.question('🤖 ' + args.question + '\n> ');
  return answer;
}

// The code decides that this one needs permission
async function writeFile(args) {
  console.log('\n--- ' + args.name + ' ---\n' + args.text + '\n---');
  const answer = await terminal.question('Save this file? (y/n) ');
  if (answer != 'y') {
    return 'The human said no. Ask them what to change.';
  }
  fs.writeFileSync(folder + '/' + path.basename(args.name), args.text);
  return 'Saved ' + args.name;
}

const functions = {
  ask_human: askHuman,
  write_file: writeFile,
};

const tools = [
  {
    type: 'function',
    function: {
      name: 'ask_human',
      description: 'Ask the human a question and wait for their answer. Use this whenever you need to know something.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'One short question' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Save text to a file. The human has to approve it first.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the file, like card.txt' },
          text: { type: 'string', description: 'The text to save' },
        },
        required: ['name', 'text'],
      },
    },
  },
];

// You start it: what you type is the first message
const task = await terminal.question('What do you need? (a birthday card, a thank you note...)\n> ');

const messages = [
  {
    role: 'system',
    content:
      'You write very short cards and notes. You know nothing about who it is for, ' +
      'so ask the human questions, one at a time, before you write. Three questions is enough. ' +
      'Then save it as a text file.',
  },
  { role: 'user', content: task },
];

let steps = 0;
while (steps < maxSteps) {
  steps++;

  const response = await ollama.chat({ model: model, messages: messages, tools: tools });
  messages.push(response.message);

  if (!response.message.tool_calls) {
    console.log(response.message.content);
    break;
  }

  for (let call of response.message.tool_calls) {
    let result;
    try {
      const tool = functions[call.function.name];
      // "await" because these tools wait for a person to type
      result = await tool(call.function.arguments);
    } catch (error) {
      result = 'Error: ' + error.message;
    }
    messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });
  }
}

console.log('Took ' + steps + ' steps (the limit is ' + maxSteps + ').');
terminal.close();
