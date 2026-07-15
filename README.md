# Oboe

Crowdfunded skill files for AI agents. Built on [MPP](https://mpp.dev).

## The problem

AI coding agents ship insecure code. Generic skill files don't go deep enough. Security researchers have no incentive to write better ones for free.

## How it works

1. You file a **Request for Skill** describing what you need.
2. Others chip in until the funding goal is met.
3. A researcher writes the skill and gets paid.
4. Backers get free access. Everyone else buys it for < $0.01 via micropayment.

Agents discover and purchase skills through the same API humans use.

```
$ curl oboe.sh/api/skills
```

## Run locally

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).

## Stack

Next.js 16, React 19, Tailwind CSS 4, TypeScript, [mppx](https://www.npmjs.com/package/mppx) for payments.
