// ── Quest definitions ─────────────────────────────────────────────────────
//
// Each rule has `lines: [...]`; each string is one Talk-button press.
// `setFlag` and `xp` only fire when the LAST line is shown.
// If the player leaves the NPC zone before reaching the last line, progress
// resets and they start from line 0 on the next approach.
//
// `ctx` fields passed to `when`:
//   kills, allDead, rewardGiven, talked, monsteredOut

const KILL_GOAL   = 3;
const KILL_EXCESS = 6;

export const NPC_QUESTS = {

  jimmy: [
    // ── All mice wiped out — subsequent visits ────────────────────────────
    {
      when: ctx => ctx.allDead && ctx.monsteredOut,
      lines: ['Please go away, you terrify me.'],
    },

    // ── All mice wiped out — first reaction ──────────────────────────────
    {
      when:    ctx => ctx.allDead,
      lines: [
        "You're a freaking monster!",
        "What is wrong with you??? I just wanted to teach them a lesson, but you have absolutely no restraint!",
        "Oh, how will I feed my family now...",
      ],
      setFlag: 'monsteredOut',
    },

    // ── Way over goal, reward already given ──────────────────────────────
    {
      when: ctx => ctx.kills >= KILL_EXCESS && ctx.rewardGiven,
      lines: ["Hey man, you can stop now, you're thinning out my customers..."],
    },

    // ── Way over goal, reward not yet given ──────────────────────────────
    {
      when:    ctx => ctx.kills >= KILL_EXCESS,
      lines:   ["But a job is a job, here's a reward for you."],
      xp:      50,
      setFlag: 'rewardGiven',
    },

    // ── Goal met, reward already given — subsequent visits ───────────────
    {
      when: ctx => ctx.kills >= KILL_GOAL && ctx.rewardGiven,
      lines: ['Hey there, you cool cat!'],
    },

    // ── Goal met, reward not yet given ───────────────────────────────────
    {
      when:    ctx => ctx.kills >= KILL_GOAL,
      lines: [
        "Wow! They're finally paying me back.",
        "Honestly, the way you just slaughtered them without even a follow-up question, I'm a little spooked myself.",
        "But what can I say, you got the job done. Here's a little thank you.",
      ],
      xp:      50,
      setFlag: 'rewardGiven',
    },

    // ── Quest active, not yet complete ───────────────────────────────────
    {
      when: ctx => ctx.talked,
      lines: ["Ah, these mice still ain't paying..."],
    },

    // ── First ever conversation — quest offer ────────────────────────────
    {
      when:    () => true,
      lines: [
        "Hey there.",
        "How's business, you ask? Not good, my friend, not good.",
        "Why not? Well, I've been making loans to the mice around here, but they aren't paying me back!",
        "You've got a rough look about you. Think you could do me a favor and show these mice that Jimmy means business?",
      ],
      setFlag: 'talked',
    },
  ],

};

// Returns the index of the winning rule for npcKey, or -1.
export function resolveRuleIndex(npcKey, questState, kills, allDead) {
  const rules = NPC_QUESTS[npcKey];
  if (!rules) return -1;
  const state = questState[npcKey] ?? {};
  const ctx = {
    kills,
    allDead,
    rewardGiven:  !!state.rewardGiven,
    talked:       !!state.talked,
    monsteredOut: !!state.monsteredOut,
  };
  return rules.findIndex(r => r.when(ctx));
}
