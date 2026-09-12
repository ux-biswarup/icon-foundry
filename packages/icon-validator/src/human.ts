import { defineHumanRule, type HumanRule } from "./types.js";

/**
 * Questions with no observable. The machine's entire job here is to put them in
 * front of a person with enough context, and then not have an opinion.
 *
 * Listing them is not decoration. A principle that cannot be checked should say
 * so, because implying an enforcement that does not exist is worse than
 * admitting there is none.
 */
export const builtInHumanRules: readonly HumanRule[] = [
  defineHumanRule({
    id: "belongs",
    label: "Belongs to the set",
    question: "Placed among its neighbours, does this fail to stand out?",
  }),
  defineHumanRule({
    id: "communicates",
    label: "Communicates the concept",
    question: "Without the name underneath, would someone know what this means?",
  }),
  defineHumanRule({
    id: "character",
    label: "Feels like the language",
    question: "Does this match the purpose the language states, rather than only its rules?",
  }),
];
