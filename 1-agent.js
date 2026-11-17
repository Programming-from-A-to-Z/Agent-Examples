// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// Hello world agent: language model + tools + loop
// node 1-agent.js "your task"

import { Ollama } from 'ollama';

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const model = 'qwen3';
// const model = 'gemma4';
// const model = 'qwen3.8:27b';

// The tool functions themselves
function rollDice(args) {
  return Math.floor(Math.random() * args.sides) + 1;
}

function add(args) {
  return args.a + args.b;
}

// Map a name to the function itself
const functions = {
  roll_dice: rollDice,
  add: add,
};

// The tools go into an array, reference the function name and include metadata like description, properties, etc.
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
      name: 'add',
      description: 'Add two numbers',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'The first number' },
          b: { type: 'number', description: 'The second number' },
        },
        required: ['a', 'b'],
      },
    },
  },
];

// What should the agent do? Give it a task on the command line:
// node 1-agent.js "Keep rolling a 6 sided dice until you roll a 6. How many rolls did it take?"
const task = process.argv[2] || 'Roll a 6 sided dice and a 20 sided dice. Then add the two rolls together.';

const messages = [
  { role: 'system', content: 'Use tools as many times as you need, one after another.' },
  { role: 'user', content: task },
];

while (true) {
  // Query the model
  const response = await ollama.chat({ model: model, messages: messages, tools: tools });
  messages.push(response.message);

  // If there are no more tool calls, exit the loop!
  if (!response.message.tool_calls) {
    console.log(response.message.content);
    break;
  }

  // Run all of the tools
  for (let call of response.message.tool_calls) {
    const tool = functions[call.function.name];
    const result = tool(call.function.arguments);
    console.log(call.function.name, call.function.arguments, '->', result);

    // Add all tool results back into the conversation
    messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });
  }
}
