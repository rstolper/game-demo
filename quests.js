// ── Quest definitions ─────────────────────────────────────────────────────
//
// Each NPC's dialogue is a list of rules checked top-to-bottom; the first
// rule whose `when` returns true wins.
//
// `ctx` passed to every `when` and `text`:
//   kills       – total enemies the player has killed this run
//   allDead     – true when no living enemies remain in the world
//   rewardGiven – true if this NPC has already handed out a reward
//   talked      – true if the player has spoken to this NPC before
//
// Rule fields:
//   when(ctx)  – predicate; required
//   text       – string shown in the speech bubble
//   xp         – XP awarded on this interaction (default 0)
//   setFlag    – key on the NPC's quest state to flip to true after showing

const KILL_GOAL   = 3;   // kills required to complete the quest
const KILL_EXCESS = 6;   // kills at which Jimmy gets spooked

export const NPC_QUESTS = {

  jimmy: [
    // ── All mice wiped out — subsequent visits ────────────────────────────
    {
      when: ctx => ctx.allDead && ctx.monsteredOut,
      text: 'Please go away, you terrify me.',
    },

    // ── All mice wiped out — first reaction ──────────────────────────────
    {
      when:    ctx => ctx.allDead,
      text:    "You're a freaking monster! What is wrong with you??? I just wanted " +
               "to teach them a lesson, but you have absolutely no restraint! " +
               "Oh, how will I feed my family now ...",
      setFlag: 'monsteredOut',
    },

    // ── Way over goal, reward already given ──────────────────────────────
    {
      when: ctx => ctx.kills >= KILL_EXCESS && ctx.rewardGiven,
      text: "Hey man, three was enough, you're thinning out my customers ...",
    },

    // ── Way over goal, reward not yet given ──────────────────────────────
    {
      when:    ctx => ctx.kills >= KILL_EXCESS,
      text:    "But a job is a job, here's a reward for you.",
      xp:      50,
      setFlag: 'rewardGiven',
    },

    // ── Goal met, reward already given — subsequent visits ───────────────
    {
      when: ctx => ctx.kills >= KILL_GOAL && ctx.rewardGiven,
      text: 'Hey there, you cool cat!',
    },

    // ── Goal met, reward not yet given ───────────────────────────────────
    {
      when:    ctx => ctx.kills >= KILL_GOAL,
      text:    "Wow, thank you man. I mean you really didn't hesitate, I'm a " +
               "little spooked myself, but what can I say you got the job done. " +
               "Here's some XP for your efforts.",
      xp:      50,
      setFlag: 'rewardGiven',
    },

    // ── Quest active, not yet complete ───────────────────────────────────
    {
      when: ctx => ctx.talked,
      text: "Ah, these mice still ain't payin ...",
    },

    // ── First ever conversation — quest offer ────────────────────────────
    {
      when:    () => true,
      text:    "Hey there, friend! Name's Jimmy. Listen, I've been giving out " +
               "some loans to the local mouse population, but they ain't been " +
               "payin' up. Think you could show 'em we mean business? " +
               "Take out " + KILL_GOAL + " of them for me.",
      setFlag: 'talked',
    },
  ],

};

// Resolve which dialogue line fires for a given NPC and game context.
// Returns { text, xp, setFlag } of the winning rule.
export function resolveDialogue(npcKey, questState, kills, allDead) {
  const rules = NPC_QUESTS[npcKey];
  if (!rules) return null;
  const state = questState[npcKey] ?? {};
  const ctx = {
    kills,
    allDead,
    rewardGiven:  !!state.rewardGiven,
    talked:       !!state.talked,
    monsteredOut: !!state.monsteredOut,
  };
  return rules.find(r => r.when(ctx)) ?? null;
}
